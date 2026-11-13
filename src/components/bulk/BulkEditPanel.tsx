import { useState } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { useStore } from '@/store'
import { useShallow } from 'zustand/react/shallow'
import { AniListClient } from '@/lib/anilist'
import { MediaType } from '@/types/anilist'
import { parseEditInput } from '@/lib/scoreFormat'
import { useBulkOperations, BulkFormOptions, EMPTY_BULK_OPTIONS, summarizeBulkChanges } from '@/hooks/useBulkOperations'
import BulkActionBar from '@/components/bulk/BulkActionBar'
import BulkEditForm from '@/components/bulk/BulkEditForm'
import BulkProgress from '@/components/bulk/BulkProgress'
import PartialFailureBar from '@/components/bulk/PartialFailureBar'
import RelationFinderModal from '@/components/RelationFinderModal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { MediaList } from '@/types/anilist'
import { Save, X } from 'lucide-react'

/** Bulk edits touching at least this many entries ask for confirmation first */
const CONFIRM_THRESHOLD = 25

interface BulkEditPanelProps {
    client: AniListClient | null
}

/**
 * Bulk edit surface (entered from ListToolbar): a floating action bar pinned
 * to the bottom of the viewport while bulk mode is active, so the cards
 * stay visible and animate to their new spots as batches confirm.
 */
export default function BulkEditPanel({ client }: BulkEditPanelProps) {
    const {
        selectedEntries,
        bulkEditMode,
        filteredEntries,
        user,
        currentType,
        setBulkEditMode,
        selectAllEntries,
        clearSelection,
        getSelectedEntries,
    } = useStore(
        useShallow(s => ({
            selectedEntries: s.selectedEntries,
            bulkEditMode: s.bulkEditMode,
            filteredEntries: s.filteredEntries,
            user: s.user,
            currentType: s.currentType,
            setBulkEditMode: s.setBulkEditMode,
            selectAllEntries: s.selectAllEntries,
            clearSelection: s.clearSelection,
            getSelectedEntries: s.getSelectedEntries,
        }))
    )

    const bulk = useBulkOperations(client)
    const [formOpen, setFormOpen] = useState(false)
    const [options, setOptions] = useState<BulkFormOptions>(EMPTY_BULK_OPTIONS)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [showApplyConfirm, setShowApplyConfirm] = useState(false)
    const [relationSeeds, setRelationSeeds] = useState<MediaList[] | null>(null)

    const selectedCount = selectedEntries.size
    const totalCount = filteredEntries.length
    const allSelected = selectedCount === totalCount && totalCount > 0
    const inputValid = parseEditInput(options.score, options.progress, user?.mediaListOptions?.scoreFormat).ok
    const changes = summarizeBulkChanges(options, currentType)
    const entriesLabel = `${selectedCount} ${selectedCount === 1 ? 'entry' : 'entries'}`

    const availableCustomLists = (() => {
        if (!user?.mediaListOptions) return []
        const key = currentType === MediaType.ANIME ? 'animeList' : 'mangaList'
        return user.mediaListOptions[key]?.customLists || []
    })()

    // A refused run (invalid input, orphan guard, failed refresh) keeps the
    // form open with the user's input so they can fix it
    const runApply = async () => {
        setShowApplyConfirm(false)
        if (await bulk.runBulkUpdate(options)) {
            setFormOpen(false)
            setOptions(EMPTY_BULK_OPTIONS)
        }
    }

    const handleApply = () => {
        if (selectedCount >= CONFIRM_THRESHOLD) setShowApplyConfirm(true)
        else void runApply()
    }

    const handleExit = () => {
        if (bulk.isBusy) return
        setBulkEditMode(false)
        setFormOpen(false)
        setOptions(EMPTY_BULK_OPTIONS)
        bulk.dismissFailed()
    }

    return (
        <>
            {/* Floating action bar */}
            <AnimatePresence>
                {bulkEditMode && (
                    <m.div
                        className="fixed bottom-0 inset-x-0 z-toolbar p-4 pointer-events-none flex justify-center"
                        initial={{ y: 96, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 96, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    >
                        <div className="pointer-events-auto w-full max-w-3xl card shadow-overlay p-3 space-y-3">
                            {/* Expanded edit form */}
                            <AnimatePresence initial={false}>
                                {formOpen && !bulk.isBusy && (
                                    <m.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.2, ease: 'easeOut' }}
                                        className="overflow-hidden"
                                    >
                                        <div className="max-h-[55vh] overflow-y-auto pr-1 pb-1">
                                            <BulkEditForm
                                                options={options}
                                                onChange={setOptions}
                                                user={user}
                                                currentType={currentType}
                                                availableCustomLists={availableCustomLists}
                                                disabled={bulk.isBusy}
                                            />
                                        </div>
                                        <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-edge mt-3">
                                            <p className="mr-auto min-w-0 text-xs text-fg-muted" aria-live="polite">
                                                {changes.length > 0 ? changes.join(' · ') : 'Pick at least one field to change'}
                                            </p>
                                            <button onClick={() => setFormOpen(false)} className="btn-secondary h-9 text-sm">
                                                <X className="w-4 h-4" />
                                                Close
                                            </button>
                                            <button
                                                onClick={handleApply}
                                                disabled={selectedCount === 0 || !inputValid || changes.length === 0}
                                                className="btn-primary h-9 text-sm"
                                            >
                                                <Save className="w-4 h-4" />
                                                Apply to {entriesLabel}
                                            </button>
                                        </div>
                                    </m.div>
                                )}
                            </AnimatePresence>

                            {/* Progress / failures / actions */}
                            {bulk.isBusy && bulk.operation ? (
                                <BulkProgress
                                    operation={bulk.operation}
                                    progress={bulk.progress}
                                    isCancelling={bulk.isCancelling}
                                    onCancel={bulk.cancel}
                                />
                            ) : bulk.failedIds.length > 0 ? (
                                <PartialFailureBar
                                    failedCount={bulk.failedIds.length}
                                    reason={bulk.failureReason}
                                    onRetry={bulk.retryFailed}
                                    onDismiss={bulk.dismissFailed}
                                />
                            ) : (
                                <BulkActionBar
                                    selectedCount={selectedCount}
                                    totalCount={totalCount}
                                    allSelected={allSelected}
                                    formOpen={formOpen}
                                    onSelectAll={selectAllEntries}
                                    onClearSelection={clearSelection}
                                    onToggleForm={() => setFormOpen(!formOpen)}
                                    onDelete={() => setShowDeleteConfirm(true)}
                                    onFindRelations={() => setRelationSeeds(getSelectedEntries())}
                                    onExit={handleExit}
                                />
                            )}
                        </div>
                    </m.div>
                )}
            </AnimatePresence>

            <RelationFinderModal
                open={relationSeeds !== null}
                onClose={() => setRelationSeeds(null)}
                client={client}
                seedEntries={relationSeeds ?? []}
            />

            <ConfirmDialog
                open={showApplyConfirm}
                title={`Apply to ${entriesLabel}?`}
                confirmLabel={`Apply to ${selectedCount}`}
                onConfirm={runApply}
                onCancel={() => setShowApplyConfirm(false)}
            >
                <ul className="list-disc pl-5 space-y-0.5">
                    {changes.map(change => <li key={change}>{change}</li>)}
                </ul>
            </ConfirmDialog>

            <ConfirmDialog
                open={showDeleteConfirm}
                title={`Delete ${selectedCount} ${selectedCount === 1 ? 'entry' : 'entries'}?`}
                danger
                confirmLabel={`Delete ${selectedCount}`}
                onConfirm={() => {
                    setShowDeleteConfirm(false)
                    bulk.runBulkDelete()
                }}
                onCancel={() => setShowDeleteConfirm(false)}
            >
                The selected entries will be permanently removed from your AniList account. This cannot
                be undone.
            </ConfirmDialog>
        </>
    )
}
