import { useRef, useState, useCallback } from 'react'
import { useStore } from '@/store'
import { AniListClient, EntryUpdates, getStatusLabel } from '@/lib/anilist'
import { errorMessage, isAlreadyDeleted } from '@/lib/graphql'
import { isAbortError } from '@/lib/pacer'
import { parseEditInput } from '@/lib/scoreFormat'
import { applyCustomListChanges, CustomListAction } from '@/lib/customLists'
import { MediaList, MediaListStatus, MediaType } from '@/types/anilist'

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

/** Human-readable list of what a bulk edit will change; empty when the form changes nothing */
export function summarizeBulkChanges(options: BulkFormOptions, mediaType: MediaType): string[] {
    const changes: string[] = []
    if (options.status) changes.push(`Status → ${getStatusLabel(options.status, mediaType)}`)
    if (options.score.trim()) changes.push(`Score → ${options.score.trim()}`)
    if (options.progress.trim()) changes.push(`Progress → ${options.progress.trim()}`)
    if (options.private !== '') changes.push(options.private === 'true' ? 'Make private' : 'Make public')
    if (options.hiddenFromStatusLists !== '') {
        changes.push(options.hiddenFromStatusLists === 'true' ? 'Hide from status lists' : 'Show in status lists')
    }
    if (options.notes.trim()) changes.push('Replace notes')
    for (const [name, action] of Object.entries(options.customLists)) {
        if (action === 'add') changes.push(`Add to “${name}”`)
        if (action === 'remove') changes.push(`Remove from “${name}”`)
    }
    return changes
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
/** Ids per UpdateMediaListEntries call: keeps each response small and a failure local */
const FAST_PATH_CHUNK_SIZE = 100

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

/**
 * An entry hidden from status lists and on no custom list disappears from
 * every list view on AniList, including this app's, with no way back from the
 * UI. True when this edit would put an entry into that state.
 */
const wouldOrphan = (entry: MediaList, updates: EntryUpdates, customLists: Record<string, CustomListAction>) => {
    const listsAfter = applyCustomListChanges(entry.customLists, customLists)
    const hiddenAfter = updates.hiddenFromStatusLists ?? entry.hiddenFromStatusLists ?? false
    const orphanedBefore = !!entry.hiddenFromStatusLists && applyCustomListChanges(entry.customLists, {}).length === 0
    return hiddenAfter && listsAfter.length === 0 && !orphanedBefore
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
        // After Stop, entries that were never sent stay unattempted, not failed
        results.forEach((r, i) => {
            if (!r.ok && (r.blamed || !signal.aborted)) ledger.fail([batch[i].id], r.message)
        })
        signal.throwIfAborted()
    }
}

/** Fast path: UpdateMediaListEntries per chunk; a chunk it rejects falls back to per-entry saves */
const updateFast = async (
    client: AniListClient,
    entries: MediaList[],
    updates: EntryUpdates,
    ledger: Ledger,
    signal: AbortSignal
) => {
    for (const batch of chunk(entries, FAST_PATH_CHUNK_SIZE)) {
        const ids = batch.map(e => e.id)
        try {
            // AniList drops IDs it did not update, so only confirmed IDs settle
            const results = await client.updateMediaListEntries(ids, updates, { signal })
            const returned = new Set(results.map(r => r.id))
            useStore.getState().mergeMediaListEntries(results)
            ledger.ok(ids.filter(id => returned.has(id)))
            ledger.fail(ids.filter(id => !returned.has(id)), 'AniList did not confirm this entry')
        } catch (error) {
            if (isAbortError(error)) throw error
            console.error('UpdateMediaListEntries failed, falling back to per-entry saves:', error)
            await saveChunked(client, batch.map(e => ({ id: e.id, mediaId: e.mediaId, updates })), ledger, signal)
        }
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
    // Claimed synchronously before any await, so a second click during the
    // pre-run refresh can't start a parallel run (render state lags behind)
    const runningRef = useRef(false)

    const isProcessing = operation === 'update'
    const isDeleting = operation === 'delete'
    const isBusy = operation !== null

    /** Starts the claimed run (see claim) on its final set of entries */
    const startRun = (entries: MediaList[]) => {
        const controller = abortRef.current ?? new AbortController()
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
        runningRef.current = false
        setOperation(null)
        setIsCancelling(false)
    }

    /** Claims the single run slot; false when a run is already going */
    // Stop works from the moment of claiming, including during the pre-run refresh
    const claim = (kind: Operation) => {
        if (runningRef.current) return false
        runningRef.current = true
        abortRef.current = new AbortController()
        setIsCancelling(false)
        setOperation(kind)
        return true
    }

    const release = () => {
        runningRef.current = false
        abortRef.current = null
        setOperation(null)
        setIsCancelling(false)
    }

    /** Resolves true when a run started; false when it was refused before touching AniList */
    const runBulkUpdate = useCallback(async (options: BulkFormOptions, entriesOverride?: MediaList[]): Promise<boolean> => {
        if (!client) return false

        const store = useStore.getState()
        const parsed = parseEditInput(options.score, options.progress, store.user?.mediaListOptions?.scoreFormat)
        if (!parsed.ok) {
            store.addNotification({ type: 'error', message: parsed.message })
            return false
        }

        const updates = buildUpdates(options, parsed)
        const customListChanges = options.customLists
        const hasCustomListChanges = Object.values(customListChanges).some(v => v === 'add' || v === 'remove')

        if (Object.keys(updates).length === 0 && !hasCustomListChanges) {
            store.addNotification({ type: 'warning', message: 'Pick at least one field to change' })
            return false
        }

        let entries = entriesOverride ?? store.getSelectedEntries()
        if (entries.length === 0 || !claim('update')) return false

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
                    // A normal run follows the refreshed selection, which drops
                    // entries that no longer match the filters; a retry keeps its ids
                    const idSet = new Set(entries.map(e => e.id))
                    entries = [...fresh.animeLists, ...fresh.mangaLists]
                        .filter(e => idSet.has(e.id) && (entriesOverride !== undefined || fresh.selectedEntries.has(e.id)))
                } catch {
                    store.addNotification({ type: 'error', message: 'Could not refresh list data — aborting custom list changes' })
                    release()
                    return false
                }
            }
        }

        if (abortRef.current?.signal.aborted || entries.length === 0) {
            release()
            return false
        }

        // Checked on the (possibly refreshed) entries, per entry: removing a
        // last custom list orphans an already-hidden entry just as hiding does
        const orphaned = entries.filter(e => wouldOrphan(e, updates, customListChanges)).length
        if (orphaned > 0) {
            const one = orphaned === 1
            store.addNotification({
                type: 'error',
                message: `${orphaned} of the selected entries would end up hidden from status lists and on no custom list, which removes ${one ? 'it' : 'them'} from every list on AniList, including this app. Keep ${one ? 'it' : 'them'} on a custom list or unhide ${one ? 'it' : 'them'} in the same edit.`
            })
            release()
            return false
        }

        lastOperationRef.current = { type: 'update', options }
        const { ledger, signal } = startRun(entries)

        try {
            if (!hasCustomListChanges) {
                await updateFast(client, entries, updates, ledger, signal)
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
        return true
    }, [client])

    const runBulkDelete = useCallback(async (entriesOverride?: MediaList[]) => {
        if (!client) return

        const entries = entriesOverride ?? useStore.getState().getSelectedEntries()
        if (entries.length === 0 || !claim('delete')) return

        lastOperationRef.current = { type: 'delete' }
        const { ledger, signal } = startRun(entries)

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

                // An entry that is already gone (on retry, or deleted by an aborted
                // batch) fails validation on the id; that counts as deleted
                const gone = batch.filter((_, i) => {
                    const r = results[i]
                    return r.ok || isAlreadyDeleted(r.message)
                })
                useStore.getState().removeMediaListEntries(gone)
                ledger.ok(gone)
                const goneSet = new Set(gone)
                results.forEach((r, i) => {
                    if (!r.ok && !goneSet.has(batch[i]) && (r.blamed || !signal.aborted)) ledger.fail([batch[i]], r.message)
                })
                signal.throwIfAborted()
            }
        } catch (error) {
            if (!isAbortError(error)) console.error('Bulk delete failed:', error)
        } finally {
            finishRun('delete', ledger)
        }
    }, [client])

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
