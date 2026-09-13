import { useRef, useState, useCallback } from 'react'
import { useStore } from '@/store'
import { AniListClient, EntryUpdates } from '@/lib/anilist'
import { errorMessage } from '@/lib/graphql'
import { isAbortError } from '@/lib/pacer'
import { parseEditInput } from '@/lib/scoreFormat'
import { applyCustomListChanges, CustomListAction } from '@/lib/customLists'
import { MediaList, MediaListStatus } from '@/types/anilist'

export interface BulkFormOptions {
    status: MediaListStatus | ''
    score: string
    progress: string
    private: string
    hiddenFromStatusLists: string
    notes: string
    customLists: Record<string, CustomListAction>
}

export const EMPTY_BULK_OPTIONS: BulkFormOptions = {
    status: '',
    score: '',
    progress: '',
    private: '',
    hiddenFromStatusLists: '',
    notes: '',
    customLists: {}
}

export interface BulkProgress {
    current: number
    total: number
    successful: number
    failed: number
}

type Operation = 'update' | 'delete'

type LastOperation =
    | { type: 'update'; options: BulkFormOptions }
    | { type: 'delete' }

/** AniList accepts ~10 aliased mutations per request comfortably */
const CHUNK_SIZE = 10

const chunk = <T,>(arr: T[], size: number): T[][] =>
    Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
        arr.slice(i * size, i * size + size)
    )

/**
 * Per-run bookkeeping: which entries settled, which failed and why, mirrored
 * into the store's per-entry sync state as it happens.
 */
const createLedger = (allIds: number[], report: (progress: BulkProgress) => void) => {
    const succeeded: number[] = []
    const failed: number[] = []
    let reason: string | null = null

    const sync = (ids: number[], state: 'pending' | 'error' | null) => useStore.getState().setEntrySync(ids, state)
    const publish = () => report({
        current: succeeded.length + failed.length,
        total: allIds.length,
        successful: succeeded.length,
        failed: failed.length,
    })

    return {
        ok(ids: number[]) {
            if (ids.length === 0) return
            sync(ids, null)
            succeeded.push(...ids)
            publish()
        },
        fail(ids: number[], message: string) {
            if (ids.length === 0) return
            sync(ids, 'error')
            failed.push(...ids)
            reason ??= message
            publish()
        },
        /** Entries never attempted (after Stop) go back to neutral */
        releaseUnattempted() {
            const done = new Set([...succeeded, ...failed])
            sync(allIds.filter(id => !done.has(id)), null)
        },
        get succeeded() { return succeeded },
        get failed() { return failed },
        get reason() { return reason },
    }
}

type Ledger = ReturnType<typeof createLedger>

const buildUpdates = (options: BulkFormOptions, parsed: { score?: number; progress?: number }): EntryUpdates => {
    const updates: EntryUpdates = {}
    if (options.status) updates.status = options.status
    if (parsed.score !== undefined) updates.score = parsed.score
    if (parsed.progress !== undefined) updates.progress = parsed.progress
    if (options.private !== '') updates.private = options.private === 'true'
    if (options.hiddenFromStatusLists !== '') updates.hiddenFromStatusLists = options.hiddenFromStatusLists === 'true'
    if (options.notes.trim()) updates.notes = options.notes
    return updates
}

/** Custom-list path: aliased SaveMediaListEntry, settled per entry */
const saveChunked = async (
    client: AniListClient,
    items: Array<{ id: number; mediaId: number; updates: EntryUpdates }>,
    ledger: Ledger,
    signal: AbortSignal
) => {
    for (const batch of chunk(items, CHUNK_SIZE)) {
        let results
        try {
            results = await client.bulkSaveMediaListEntries(
                batch.map(({ mediaId, updates }) => ({ mediaId, updates })),
                { signal }
            )
        } catch (error) {
            if (isAbortError(error)) throw error
            console.error('Bulk save chunk failed:', error)
            ledger.fail(batch.map(b => b.id), errorMessage(error))
            continue
        }

        const confirmed = results.flatMap(r => (r.ok ? [r.data] : []))
        useStore.getState().mergeMediaListEntries(confirmed)
        ledger.ok(batch.filter((_, i) => results[i].ok).map(b => b.id))
        results.forEach((r, i) => {
            if (!r.ok) ledger.fail([batch[i].id], r.message)
        })
    }
}

/**
 * Bulk mutation engine with settled updates: the store is only written after
 * the server confirms each entry, so cards animate to their new positions as
 * confirmations arrive and there is never a full-list refetch. Pacing and
 * retries live in the client; Stop aborts the next wait immediately and lets
 * the one request in flight land.
 */
export function useBulkOperations(client: AniListClient | null) {
    const [operation, setOperation] = useState<Operation | null>(null)
    const [progress, setProgress] = useState<BulkProgress>({ current: 0, total: 0, successful: 0, failed: 0 })
    const [isCancelling, setIsCancelling] = useState(false)
    const [failedIds, setFailedIds] = useState<number[]>([])
    const [failureReason, setFailureReason] = useState<string | null>(null)

    const abortRef = useRef<AbortController | null>(null)
    const lastOperationRef = useRef<LastOperation | null>(null)

    const isProcessing = operation === 'update'
    const isDeleting = operation === 'delete'
    const isBusy = operation !== null

    const startRun = (kind: Operation, entries: MediaList[]) => {
        const controller = new AbortController()
        abortRef.current = controller
        setIsCancelling(false)
        setOperation(kind)
        setFailedIds([])
        setFailureReason(null)

        const allIds = entries.map(e => e.id)
        useStore.getState().setEntrySync(allIds, 'pending')
        setProgress({ current: 0, total: allIds.length, successful: 0, failed: 0 })
        return { ledger: createLedger(allIds, setProgress), signal: controller.signal }
    }

    const finishRun = (kind: Operation, ledger: Ledger) => {
        const store = useStore.getState()
        ledger.releaseUnattempted()

        if (ledger.succeeded.length > 0) {
            // Local state now reflects confirmed server state; keep the
            // freshness window open so nothing schedules a clobbering refetch.
            store.setLastDataLoad(Date.now())
            store.deselectEntries(ledger.succeeded)
        }

        setFailedIds(ledger.failed)
        setFailureReason(ledger.reason)

        const verb = kind === 'update' ? 'updated' : 'deleted'
        const count = ledger.succeeded.length
        if (ledger.failed.length === 0) {
            store.addNotification({
                type: count > 0 ? 'success' : 'error',
                message: count > 0
                    ? `${count} ${count === 1 ? 'entry' : 'entries'} ${verb}`
                    : `No entries were ${verb}`
            })
        } else {
            store.addNotification({
                type: 'warning',
                message: `${count} ${verb}, ${ledger.failed.length} failed — failed entries stay selected for retry`
            })
        }

        abortRef.current = null
        setOperation(null)
        setIsCancelling(false)
    }

    const runBulkUpdate = useCallback(async (options: BulkFormOptions, entriesOverride?: MediaList[]) => {
        if (!client || isBusy) return

        const store = useStore.getState()
        const parsed = parseEditInput(options.score, options.progress, store.user?.mediaListOptions?.scoreFormat)
        if (!parsed.ok) {
            store.addNotification({ type: 'error', message: parsed.message })
            return
        }

        const updates = buildUpdates(options, parsed)
        const customListChanges = options.customLists
        const hasCustomListChanges = Object.values(customListChanges).some(v => v === 'add' || v === 'remove')

        if (Object.keys(updates).length === 0 && !hasCustomListChanges) {
            store.addNotification({ type: 'warning', message: 'Pick at least one field to change' })
            return
        }

        let entries = entriesOverride ?? store.getSelectedEntries()
        if (entries.length === 0) return

        // customLists is a full-replacement array on AniList's side, so a write
        // built from stale entry data silently drops memberships added
        // elsewhere. Refresh first when the local snapshot is past its window.
        if (hasCustomListChanges) {
            const { lastDataLoad, user } = store
            const fiveMinutes = 5 * 60 * 1000
            if (user && (!lastDataLoad || Date.now() - lastDataLoad > fiveMinutes)) {
                store.addNotification({ type: 'info', message: 'Refreshing list data before editing custom lists…' })
                try {
                    await store.fetchMediaLists(user.id, useStore.getState().currentType, true)
                    const fresh = useStore.getState()
                    const idSet = new Set(entries.map(e => e.id))
                    entries = [...fresh.animeLists, ...fresh.mangaLists].filter(e => idSet.has(e.id))
                } catch {
                    store.addNotification({ type: 'error', message: 'Could not refresh list data — aborting custom list changes' })
                    return
                }
            }
        }

        lastOperationRef.current = { type: 'update', options }
        const { ledger, signal } = startRun('update', entries)

        try {
            if (!hasCustomListChanges) {
                // Fast path: one UpdateMediaListEntries call for the whole selection.
                // AniList drops IDs it did not update, so only confirmed IDs settle.
                const allIds = entries.map(e => e.id)
                try {
                    const results = await client.updateMediaListEntries(allIds, updates, { signal })
                    const returned = new Set(results.map(r => r.id))
                    useStore.getState().mergeMediaListEntries(results)
                    ledger.ok(allIds.filter(id => returned.has(id)))
                    ledger.fail(allIds.filter(id => !returned.has(id)), 'AniList did not confirm this entry')
                } catch (error) {
                    if (isAbortError(error)) throw error
                    console.error('UpdateMediaListEntries failed, falling back to per-entry saves:', error)
                    await saveChunked(client, entries.map(entry => ({ id: entry.id, mediaId: entry.mediaId, updates })), ledger, signal)
                }
            } else {
                await saveChunked(
                    client,
                    entries.map(entry => ({
                        id: entry.id,
                        mediaId: entry.mediaId,
                        updates: { ...updates, customLists: applyCustomListChanges(entry.customLists, customListChanges) },
                    })),
                    ledger,
                    signal
                )
            }
        } catch (error) {
            if (!isAbortError(error)) console.error('Bulk update failed:', error)
        } finally {
            finishRun('update', ledger)
        }
    }, [client, isBusy])

    const runBulkDelete = useCallback(async (entriesOverride?: MediaList[]) => {
        if (!client || isBusy) return

        const entries = entriesOverride ?? useStore.getState().getSelectedEntries()
        if (entries.length === 0) return

        lastOperationRef.current = { type: 'delete' }
        const { ledger, signal } = startRun('delete', entries)

        try {
            for (const batch of chunk(entries.map(e => e.id), CHUNK_SIZE)) {
                let results
                try {
                    results = await client.bulkDeleteMediaListEntries(batch, { signal })
                } catch (error) {
                    if (isAbortError(error)) throw error
                    console.error('Bulk delete chunk failed:', error)
                    ledger.fail(batch, errorMessage(error))
                    continue
                }

                // An entry that is already gone (e.g. on retry) counts as deleted
                const gone = batch.filter((_, i) => results[i].ok || /not found/i.test(results[i].ok ? '' : results[i].message))
                useStore.getState().removeMediaListEntries(gone)
                ledger.ok(gone)
                const goneSet = new Set(gone)
                results.forEach((r, i) => {
                    if (!r.ok && !goneSet.has(batch[i])) ledger.fail([batch[i]], r.message)
                })
            }
        } catch (error) {
            if (!isAbortError(error)) console.error('Bulk delete failed:', error)
        } finally {
            finishRun('delete', ledger)
        }
    }, [client, isBusy])

    const retryFailed = useCallback(() => {
        const last = lastOperationRef.current
        if (!last || failedIds.length === 0) return

        const store = useStore.getState()
        const failedSet = new Set(failedIds)
        const entries = [...store.animeLists, ...store.mangaLists].filter(e => failedSet.has(e.id))
        store.setEntrySync(failedIds, null)
        setFailedIds([])
        setFailureReason(null)

        if (last.type === 'update') {
            runBulkUpdate(last.options, entries)
        } else {
            runBulkDelete(entries)
        }
    }, [failedIds, runBulkUpdate, runBulkDelete])

    const dismissFailed = useCallback(() => {
        useStore.getState().setEntrySync(failedIds, null)
        setFailedIds([])
        setFailureReason(null)
    }, [failedIds])

    const cancel = useCallback(() => {
        if (!operation || !abortRef.current) return
        setIsCancelling(true)
        abortRef.current.abort()
        useStore.getState().addNotification({
            type: 'info',
            message: 'Stopping — the request already in flight will finish first'
        })
    }, [operation])

    return {
        operation,
        isProcessing,
        isDeleting,
        isBusy,
        isCancelling,
        progress,
        failedIds,
        failureReason,
        runBulkUpdate,
        runBulkDelete,
        retryFailed,
        dismissFailed,
        cancel,
    }
}
