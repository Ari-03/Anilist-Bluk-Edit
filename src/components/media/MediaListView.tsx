import { useCallback, useState } from 'react'
import { selectCurrentLists, useStore } from '@/store'
import { useShallow } from 'zustand/react/shallow'
import { AniListClient } from '@/lib/anilist'
import { MediaList, MediaListStatus, MediaType } from '@/types/anilist'
import { getScoreRange, parseEditInput } from '@/lib/scoreFormat'
import MediaCard from '@/components/media/MediaCard'
import MediaListRow from '@/components/media/MediaListRow'
import StatusSection from '@/components/media/StatusSection'
import ListMotion from '@/components/media/ListMotion'
import QuickEditDialog, { QuickEditValues } from '@/components/media/QuickEditDialog'
import EmptyState from '@/components/media/EmptyState'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

const EMPTY_EDIT: QuickEditValues = { score: '', progress: '', notes: '' }

// Past this many entries, off-screen ones skip layout and paint until scrolled near
const CONTENT_VISIBILITY_FROM = 150

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
        currentLists,
        clearFilters,
    } = useStore(
        useShallow(s => ({
            user: s.user,
            currentType: s.currentType,
            filteredEntries: s.filteredEntries,
            selectedEntries: s.selectedEntries,
            bulkEditMode: s.bulkEditMode,
            entrySync: s.entrySync,
            viewMode: s.viewMode,
            filters: s.filters,
            collapsedStatusSections: s.collapsedStatusSections,
            toggleStatusSection: s.toggleStatusSection,
            selectEntries: s.selectEntries,
            deselectEntries: s.deselectEntries,
            toggleEntrySelection: s.toggleEntrySelection,
            mergeMediaListEntries: s.mergeMediaListEntries,
            removeMediaListEntry: s.removeMediaListEntry,
            addNotification: s.addNotification,
            currentLists: selectCurrentLists(s),
            clearFilters: s.clearFilters,
        }))
    )

    const [editingEntry, setEditingEntry] = useState<number | null>(null)
    const [editValues, setEditValues] = useState<QuickEditValues>(EMPTY_EDIT)
    const [editError, setEditError] = useState<{ field: 'score' | 'progress'; message: string } | null>(null)
    const [savingEdit, setSavingEdit] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null)
    const [deletingSingle, setDeletingSingle] = useState(false)

    const scoreFormat = user?.mediaListOptions?.scoreFormat
    const scoreRange = getScoreRange(scoreFormat)

    const closeEdit = () => {
        setEditingEntry(null)
        setEditValues(EMPTY_EDIT)
        setEditError(null)
    }

    // Stable so memoized cards skip re-rendering when other entries change
    const handleStartEdit = useCallback((entry: MediaList) => {
        setEditingEntry(entry.id)
        setEditError(null)
        setEditValues({
            status: entry.status,
            score: String(entry.score ?? 0),
            progress: String(entry.progress ?? 0),
            notes: entry.notes || '',
        })
    }, [])

    const handleDelete = useCallback((entry: MediaList) => {
        setDeleteTarget({
            id: entry.id,
            title: entry.media?.title?.userPreferred || entry.media?.title?.romaji || 'this entry',
        })
    }, [])

    const handleSaveEdit = async (mediaId: number) => {
        if (!client) return
        const parsed = parseEditInput(editValues.score, editValues.progress, scoreFormat)
        if (!parsed.ok) {
            setEditError({ field: parsed.field, message: parsed.message })
            return
        }
        setEditError(null)
        setSavingEdit(true)
        try {
            const result = await client.updateMediaListEntry(mediaId, {
                status: editValues.status,
                score: parsed.score,
                progress: parsed.progress,
                notes: editValues.notes,
            })
            mergeMediaListEntries([result])
            closeEdit()
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
            // Deleting from the edit dialog closes it along with the confirmation
            if (deleteTarget.id === editingEntry) closeEdit()
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
                libraryEmpty={currentLists.length === 0}
                hasActiveFilters={hasActiveFilters}
                onRefresh={() => {
                    if (user) useStore.getState().fetchMediaLists(user.id, currentType, true).catch(() => { })
                }}
                onClearFilters={clearFilters}
            />
        )
    }

    const isGrid = viewMode === 'grid'
    const containerClass = isGrid ? 'cover-grid' : 'flex flex-col gap-1.5'

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

    const deferOffscreen = filteredEntries.length > CONTENT_VISIBILITY_FROM
    const editedEntry = editingEntry === null ? null : currentLists.find(e => e.id === editingEntry) ?? null
    const selectionActive = bulkEditMode && selectedEntries.size > 0

    const renderEntries = (entries: MediaList[]) => (
        <div className={containerClass}>
            {entries.map(entry => {
                const shared = {
                    entry,
                    currentType,
                    bulkEditMode,
                    selected: selectedEntries.has(entry.id),
                    selectionActive,
                    showStatus: !showSections,
                    syncState: entrySync[entry.id],
                    onToggleSelect: toggleEntrySelection,
                    onStartEdit: handleStartEdit,
                    onDelete: handleDelete,
                }

                return (
                    // data-entry-id is how ListMotion finds each entry to animate it
                    <div
                        key={entry.id}
                        data-entry-id={entry.id}
                        // content-visibility clips what an entry paints outside its box; the
                        // margin leaves room for a card's hover lift and shadow
                        className={!deferOffscreen ? undefined : isGrid
                            ? '[content-visibility:auto] [contain-intrinsic-size:auto_280px] [overflow-clip-margin:12px]'
                            : '[content-visibility:auto] [contain-intrinsic-size:auto_62px] [overflow-clip-margin:12px]'}
                    >
                        {isGrid ? <MediaCard {...shared} /> : <MediaListRow {...shared} />}
                    </div>
                )
            })}
        </div>
    )

    return (
        <>
            {/* Entries glide to their new places when the list is searched, filtered, sorted or edited */}
            <ListMotion entries={filteredEntries} layoutKey={`${currentType}-${viewMode}`}>
                {showSections ? (
                    <div className="space-y-4">
                        {orderedStatuses.map(status => {
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
            </ListMotion>

            <QuickEditDialog
                entry={editedEntry}
                values={editValues}
                onChange={setEditValues}
                onSave={() => editedEntry && handleSaveEdit(editedEntry.mediaId)}
                onCancel={closeEdit}
                onDelete={handleDelete}
                scoreRange={scoreRange}
                currentType={currentType}
                busy={savingEdit}
                error={editError}
            />

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
