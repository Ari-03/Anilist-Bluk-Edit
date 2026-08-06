import { useRef, useState, useCallback } from 'react'
import { useStore } from '@/store'
import { AniListClient } from '@/lib/anilist'
import { MediaList, MediaListStatus } from '@/types/anilist'
import { RateLimiter, RateLimiterStats } from '@/lib/rateLimiter'

export interface BulkFormOptions {
    status: MediaListStatus | ''
    score: string
    progress: string
    private: string
    hiddenFromStatusLists: string
    notes: string
    customLists: Record<string, 'add' | 'remove' | null>
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

export interface RateLimiterConfig {
    maxRequestsPerSecond: number
    maxConcurrentRequests: number
    maxRetries: number
    initialRetryDelay: number
}

const DEFAULT_RATE_CONFIG: RateLimiterConfig = {
    maxRequestsPerSecond: 0.5,
    maxConcurrentRequests: 1,
    maxRetries: 3,
    initialRetryDelay: 2000
}

type LastOperation =
    | { type: 'update'; options: BulkFormOptions }
    | { type: 'delete' }

const chunk = <T,>(arr: T[], size: number): T[][] =>
    Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
        arr.slice(i * size, i * size + size)
    )

/**
 * Bulk mutation engine with settled updates: the store is only written after
 * the server confirms each batch, so entries animate to their new positions
 * as confirmations arrive and there is never a full-list refetch.
 */
export function useBulkOperations(client: AniListClient | null) {
    const [operation, setOperation] = useState<'update' | 'delete' | null>(null)
    const [progress, setProgress] = useState<BulkProgress>({ current: 0, total: 0, successful: 0, failed: 0 })
    const [rateLimiterStats, setRateLimiterStats] = useState<RateLimiterStats | null>(null)
    const [rateLimiterConfig, setRateLimiterConfig] = useState<RateLimiterConfig>(DEFAULT_RATE_CONFIG)
    const [isCancelling, setIsCancelling] = useState(false)
    const [failedIds, setFailedIds] = useState<number[]>([])

    const rateLimiterRef = useRef<RateLimiter | null>(null)
    const cancelRef = useRef(false)
    const lastOperationRef = useRef<LastOperation | null>(null)

    const isProcessing = operation === 'update'
    const isDeleting = operation === 'delete'
    const isBusy = operation !== null

    const buildUpdates = (options: BulkFormOptions) => {
        const updates: Record<string, any> = {}
        if (options.status) updates.status = options.status
        if (options.score) updates.score = parseFloat(options.score)
        if (options.progress) updates.progress = parseInt(options.progress)
        if (options.private !== '') updates.private = options.private === 'true'
        if (options.hiddenFromStatusLists !== '') updates.hiddenFromStatusLists = options.hiddenFromStatusLists === 'true'
        if (options.notes.trim()) updates.notes = options.notes
        return updates
    }

    const finishRun = (
        kind: 'update' | 'delete',
        succeededIds: number[],
        failed: number[],
        stats: RateLimiterStats | null
    ) => {
        const store = useStore.getState()

        if (succeededIds.length > 0) {
            // Local state now reflects confirmed server state; keep the
            // freshness window open so nothing schedules a clobbering refetch.
            store.setLastDataLoad(Date.now())
            store.deselectEntries(succeededIds)
        }

        setFailedIds(failed)

        const verb = kind === 'update' ? 'updated' : 'deleted'
        if (failed.length === 0) {
            store.addNotification({
                type: succeededIds.length > 0 ? 'success' : 'error',
                message: succeededIds.length > 0
                    ? `${succeededIds.length} ${succeededIds.length === 1 ? 'entry' : 'entries'} ${verb}`
                    : `No entries were ${verb}`
            })
        } else {
            store.addNotification({
                type: 'warning',
                message: `${succeededIds.length} ${verb}, ${failed.length} failed — failed entries stay selected for retry`
            })
        }

        if (stats) setRateLimiterStats(stats)
    }

    const runBulkUpdate = useCallback(async (options: BulkFormOptions, entriesOverride?: MediaList[]) => {
        if (!client || isBusy) return

        const updates = buildUpdates(options)
        const customListChanges = options.customLists
        const hasCustomListChanges = Object.values(customListChanges).some(v => v === 'add' || v === 'remove')

        const store = useStore.getState()
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
        cancelRef.current = false
        setIsCancelling(false)
        setOperation('update')
        setFailedIds([])
        setProgress({ current: 0, total: entries.length, successful: 0, failed: 0 })
        rateLimiterRef.current = new RateLimiter(rateLimiterConfig)

        const allIds = entries.map(e => e.id)
        store.setEntrySync(allIds, 'pending')

        const succeededIds: number[] = []
        const failed: number[] = []

        const runChunked = async (
            entriesToUpdate: Array<{ id: number; mediaId: number; updates: any }>
        ) => {
            for (const chunkItems of chunk(entriesToUpdate, 10)) {
                if (cancelRef.current) {
                    // Entries never attempted: release their pending state
                    const remaining = entriesToUpdate
                        .filter(e => !succeededIds.includes(e.id) && !failed.includes(e.id))
                        .map(e => e.id)
                    useStore.getState().setEntrySync(remaining, null)
                    break
                }
                const chunkIds = chunkItems.map(e => e.id)
                try {
                    const results = await rateLimiterRef.current!.execute(() =>
                        client.bulkSaveMediaListEntries(chunkItems.map(({ mediaId, updates }) => ({ mediaId, updates })))
                    )
                    // Settle this chunk: merge confirmed results, release pending —
                    // cards animate to their new spots as each batch lands.
                    useStore.getState().mergeMediaListEntries(results as Array<Partial<MediaList> & { id: number }>)
                    useStore.getState().setEntrySync(chunkIds, null)
                    succeededIds.push(...chunkIds)
                } catch (error: any) {
                    console.error('Bulk update chunk failed:', error)
                    useStore.getState().setEntrySync(chunkIds, 'error')
                    failed.push(...chunkIds)
                }
                setProgress({
                    current: succeededIds.length + failed.length,
                    total: entries.length,
                    successful: succeededIds.length,
                    failed: failed.length
                })
                if (rateLimiterRef.current) setRateLimiterStats(rateLimiterRef.current.getStats())
            }
        }

        try {
            if (!hasCustomListChanges) {
                // Fast path: one UpdateMediaListEntries call for the whole selection
                try {
                    const results = await rateLimiterRef.current.execute(() =>
                        client.updateMediaListEntries(allIds, updates)
                    )
                    useStore.getState().mergeMediaListEntries(results as Array<Partial<MediaList> & { id: number }>)
                    useStore.getState().setEntrySync(allIds, null)
                    succeededIds.push(...allIds)
                    setProgress({ current: entries.length, total: entries.length, successful: entries.length, failed: 0 })
                } catch (error) {
                    console.error('UpdateMediaListEntries failed, falling back to chunked saves:', error)
                    await runChunked(entries.map(entry => ({ id: entry.id, mediaId: entry.mediaId, updates })))
                }
            } else {
                // Custom-list path: reconstruct each entry's full membership
                // (customLists is a full-replacement array on AniList's side)
                const entriesToUpdate = entries.map(entry => {
                    const entryUpdates = { ...updates }
                    const currentCustomLists = Object.keys(entry.customLists || {}).filter(
                        listName => entry.customLists && entry.customLists[listName]
                    )
                    const listsToAdd = Object.entries(customListChanges)
                        .filter(([, v]) => v === 'add')
                        .map(([k]) => k)
                    const listsToRemove = new Set(
                        Object.entries(customListChanges)
                            .filter(([, v]) => v === 'remove')
                            .map(([k]) => k)
                    )
                    let finalCustomLists = currentCustomLists.filter(list => !listsToRemove.has(list))
                    finalCustomLists = Array.from(new Set([...finalCustomLists, ...listsToAdd]))
                    entryUpdates.customLists = finalCustomLists
                    return { id: entry.id, mediaId: entry.mediaId, updates: entryUpdates }
                })
                await runChunked(entriesToUpdate)
            }

            finishRun('update', succeededIds, failed, rateLimiterRef.current?.getStats() ?? null)
        } catch (error: any) {
            console.error('Bulk update failed:', error)
            useStore.getState().setEntrySync(allIds.filter(id => !succeededIds.includes(id)), 'error')
            useStore.getState().addNotification({
                type: 'error',
                message: `Bulk update failed. ${error.message || 'Please try again.'}`
            })
        } finally {
            setOperation(null)
            setIsCancelling(false)
        }
    }, [client, isBusy, rateLimiterConfig])

    const runBulkDelete = useCallback(async (entriesOverride?: MediaList[]) => {
        if (!client || isBusy) return

        const store = useStore.getState()
        const entries = entriesOverride ?? store.getSelectedEntries()
        if (entries.length === 0) return

        lastOperationRef.current = { type: 'delete' }
        cancelRef.current = false
        setIsCancelling(false)
        setOperation('delete')
        setFailedIds([])
        setProgress({ current: 0, total: entries.length, successful: 0, failed: 0 })
        rateLimiterRef.current = new RateLimiter(rateLimiterConfig)

        const allIds = entries.map(e => e.id)
        store.setEntrySync(allIds, 'pending')

        const succeededIds: number[] = []
        const failed: number[] = []

        try {
            for (const entry of entries) {
                if (cancelRef.current) {
                    const remaining = allIds.filter(id => !succeededIds.includes(id) && !failed.includes(id))
                    useStore.getState().setEntrySync(remaining, null)
                    break
                }
                try {
                    await rateLimiterRef.current.execute(() => client.deleteMediaListEntry(entry.id))
                    // Confirmed gone on the server: remove locally (card animates out)
                    useStore.getState().setEntrySync([entry.id], null)
                    useStore.getState().removeMediaListEntry(entry.id)
                    succeededIds.push(entry.id)
                } catch (error) {
                    console.error(`Failed to delete entry ${entry.id}:`, error)
                    useStore.getState().setEntrySync([entry.id], 'error')
                    failed.push(entry.id)
                }
                setProgress({
                    current: succeededIds.length + failed.length,
                    total: entries.length,
                    successful: succeededIds.length,
                    failed: failed.length
                })
                if (rateLimiterRef.current) setRateLimiterStats(rateLimiterRef.current.getStats())
            }

            finishRun('delete', succeededIds, failed, rateLimiterRef.current?.getStats() ?? null)
        } catch (error: any) {
            console.error('Bulk delete failed:', error)
            useStore.getState().addNotification({
                type: 'error',
                message: `Bulk delete failed. ${error.message || 'Please try again.'}`
            })
        } finally {
            setOperation(null)
            setIsCancelling(false)
        }
    }, [client, isBusy, rateLimiterConfig])

    const retryFailed = useCallback(() => {
        const last = lastOperationRef.current
        if (!last || failedIds.length === 0) return

        const store = useStore.getState()
        const failedSet = new Set(failedIds)
        const entries = [...store.animeLists, ...store.mangaLists].filter(e => failedSet.has(e.id))
        store.setEntrySync(failedIds, null)
        setFailedIds([])

        if (last.type === 'update') {
            runBulkUpdate(last.options, entries)
        } else {
            runBulkDelete(entries)
        }
    }, [failedIds, runBulkUpdate, runBulkDelete])

    const dismissFailed = useCallback(() => {
        useStore.getState().setEntrySync(failedIds, null)
        setFailedIds([])
    }, [failedIds])

    const cancel = useCallback(() => {
        if (!operation) return
        cancelRef.current = true
        setIsCancelling(true)
        rateLimiterRef.current?.stop()
        useStore.getState().addNotification({
            type: 'info',
            message: 'Cancelling — the current batch will finish first'
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
        rateLimiterStats,
        rateLimiterConfig,
        setRateLimiterConfig,
        runBulkUpdate,
        runBulkDelete,
        retryFailed,
        dismissFailed,
        cancel,
    }
}
