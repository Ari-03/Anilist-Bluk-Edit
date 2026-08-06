import { useRef, useState } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { useStore } from '@/store'
import { AniListClient } from '@/lib/anilist'
import { MediaList, MediaListStatus, MediaType } from '@/types/anilist'
import { getScoreRange } from '@/lib/scoreFormat'
import MediaCard from '@/components/media/MediaCard'
import MediaListRow from '@/components/media/MediaListRow'
import StatusSection from '@/components/media/StatusSection'
import QuickEditForm, { QuickEditValues } from '@/components/media/QuickEditForm'
import EmptyState from '@/components/media/EmptyState'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

// Mirrors the status sort order in the store's applyFilters()
const STATUS_SECTION_ORDER: MediaListStatus[] = [
    MediaListStatus.CURRENT,
    MediaListStatus.PLANNING,
    MediaListStatus.COMPLETED,
    MediaListStatus.DROPPED,
    MediaListStatus.PAUSED,
    MediaListStatus.REPEATING,
]

interface MediaListViewProps {
    client: AniListClient | null
}

export default function MediaListView({ client }: MediaListViewProps) {
    const {
        user,
        currentType,
        filteredEntries,
        selectedEntries,
        bulkEditMode,
        entrySync,
        viewMode,
        filters,
        collapsedStatusSections,
        toggleStatusSection,
        selectEntries,
        deselectEntries,
        toggleEntrySelection,
        mergeMediaListEntries,
        removeMediaListEntry,
        addNotification,
        getCurrentLists,
        clearFilters,
    } = useStore()

    const [editingEntry, setEditingEntry] = useState<number | null>(null)
    const [editValues, setEditValues] = useState<QuickEditValues>({})
    const [savingEdit, setSavingEdit] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null)
    const [deletingSingle, setDeletingSingle] = useState(false)

    // Stagger card entrances only on the first load of data
    const hasStaggeredRef = useRef(false)
    const staggerThisRender = !hasStaggeredRef.current && filteredEntries.length > 0
    if (filteredEntries.length > 0) hasStaggeredRef.current = true

    const scoreRange = getScoreRange(user?.mediaListOptions?.scoreFormat)

    const handleStartEdit = (entry: (typeof filteredEntries)[number]) => {
        setEditingEntry(entry.id)
        setEditValues({
            status: entry.status,
            score: entry.score || 0,
            progress: entry.progress || 0,
            notes: entry.notes || '',
        })
    }

    const handleSaveEdit = async (entryId: number, mediaId: number) => {
        if (!client) return
        setSavingEdit(true)
        try {
            const result = await client.updateMediaListEntry(mediaId, editValues)
            mergeMediaListEntries([result])
            setEditingEntry(null)
            setEditValues({})
            addNotification({ type: 'success', message: 'Entry updated' })
        } catch (error) {
            console.error('Failed to update entry:', error)
            addNotification({ type: 'error', message: 'Failed to update entry' })
        } finally {
            setSavingEdit(false)
        }
    }

    const handleConfirmDelete = async () => {
        if (!client || !deleteTarget) return
        setDeletingSingle(true)
        try {
            await client.deleteMediaListEntry(deleteTarget.id)
            removeMediaListEntry(deleteTarget.id)
            addNotification({ type: 'success', message: `Deleted “${deleteTarget.title}”` })
            setDeleteTarget(null)
        } catch (error) {
            console.error('Failed to delete entry:', error)
            addNotification({ type: 'error', message: 'Failed to delete entry' })
        } finally {
            setDeletingSingle(false)
        }
    }

    if (!user) {
        return (
            <div className="text-center py-8">
                <p className="text-fg-muted">Please sign in to view your lists</p>
            </div>
        )
    }

    const hasActiveFilters = !!(
        filters.search ||
        filters.status?.length ||
        filters.format?.length ||
        filters.genre?.length ||
        filters.country?.length ||
        filters.year?.start ||
        filters.year?.end ||
        filters.score?.min ||
        filters.score?.max
    )

    if (filteredEntries.length === 0) {
        return (
            <EmptyState
                currentType={currentType}
                libraryEmpty={getCurrentLists().length === 0}
                hasActiveFilters={hasActiveFilters}
                onRefresh={() => {
                    if (user) useStore.getState().fetchMediaLists(user.id, currentType, true).catch(() => { })
                }}
                onClearFilters={clearFilters}
            />
        )
    }

    const isGrid = viewMode === 'grid'
    const containerClass = isGrid
        ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4'
        : 'flex flex-col gap-2'

    // Group entries by watch status; sections render only when more than one
    // status is present (single-status views stay flat)
    const statusGroups = new Map<MediaListStatus, MediaList[]>()
    for (const entry of filteredEntries) {
        const key = (entry.status ?? 'UNKNOWN') as MediaListStatus
        const group = statusGroups.get(key)
        if (group) {
            group.push(entry)
        } else {
            statusGroups.set(key, [entry])
        }
    }
    const orderedStatuses = Array.from(statusGroups.keys()).sort((a, b) => {
        const ai = STATUS_SECTION_ORDER.indexOf(a)
        const bi = STATUS_SECTION_ORDER.indexOf(b)
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
    const showSections = orderedStatuses.length > 1
    const collapsedForType = collapsedStatusSections[currentType] || []

    const renderEntries = (entries: MediaList[]) => (
        <div className={containerClass}>
            <AnimatePresence mode="popLayout">
                {entries.map((entry, index) => {
                        const editForm =
                            editingEntry === entry.id ? (
                                <QuickEditForm
                                    entry={entry}
                                    values={editValues}
                                    onChange={setEditValues}
                                    onSave={() => entry.media && handleSaveEdit(entry.id, entry.media.id)}
                                    onCancel={() => {
                                        setEditingEntry(null)
                                        setEditValues({})
                                    }}
                                    scoreRange={scoreRange}
                                    currentType={currentType}
                                    layout={isGrid ? 'stacked' : 'row'}
                                    busy={savingEdit}
                                />
                            ) : undefined

                        const shared = {
                            entry,
                            currentType,
                            bulkEditMode,
                            selected: selectedEntries.has(entry.id),
                            syncState: entrySync[entry.id],
                            onToggleSelect: () => toggleEntrySelection(entry.id),
                            onStartEdit: () => handleStartEdit(entry),
                            onDelete: () =>
                                setDeleteTarget({
                                    id: entry.id,
                                    title: entry.media?.title?.userPreferred || entry.media?.title?.romaji || 'this entry',
                                }),
                            editForm,
                        }

                        return (
                            <m.div
                                key={entry.id}
                                layout="position"
                                initial={{ opacity: 0, scale: 0.96 }}
                                animate={{
                                    opacity: 1,
                                    scale: 1,
                                    transition: {
                                        duration: 0.25,
                                        delay: staggerThisRender ? Math.min(index * 0.02, 0.4) : 0,
                                    },
                                }}
                                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.18 } }}
                                transition={{ layout: { type: 'spring', stiffness: 350, damping: 30 } }}
                            >
                                {isGrid ? <MediaCard {...shared} /> : <MediaListRow {...shared} />}
                            </m.div>
                        )
                    })}
            </AnimatePresence>
        </div>
    )

    return (
        <>
            {showSections ? (
                <div className="space-y-4">
                    {orderedStatuses.map((status) => {
                        const entries = statusGroups.get(status)!
                        const sectionSelected = entries.reduce(
                            (n, entry) => n + (selectedEntries.has(entry.id) ? 1 : 0),
                            0
                        )
                        return (
                            <StatusSection
                                key={status}
                                status={status}
                                mediaType={currentType}
                                count={entries.length}
                                collapsed={collapsedForType.includes(status)}
                                onToggleCollapsed={() => toggleStatusSection(currentType, status)}
                                bulkEditMode={bulkEditMode}
                                selectedCount={sectionSelected}
                                onSelectSection={() => selectEntries(entries.map(e => e.id))}
                                onDeselectSection={() => deselectEntries(entries.map(e => e.id))}
                            >
                                {renderEntries(entries)}
                            </StatusSection>
                        )
                    })}
                </div>
            ) : (
                renderEntries(filteredEntries)
            )}

            <ConfirmDialog
                open={deleteTarget !== null}
                title="Delete entry?"
                danger
                busy={deletingSingle}
                confirmLabel="Delete"
                onConfirm={handleConfirmDelete}
                onCancel={() => setDeleteTarget(null)}
            >
                “{deleteTarget?.title}” will be permanently removed from your AniList account.
            </ConfirmDialog>
        </>
    )
}
