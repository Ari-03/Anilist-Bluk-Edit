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
import { ArrowLeft, Check, CheckSquare } from 'lucide-react'

/** Bulk edits touching at least this many entries ask for confirmation first */
const CONFIRM_THRESHOLD = 25

interface BulkEditPanelProps {
    client: AniListClient | null
}

// Both floating surfaces sit along the bottom of the list column, clear of the
// desktop sidebar (w-64, shown from lg up): the Bulk edit button in the
// bottom-right corner, the bulk bar centred
const DOCK = 'fixed bottom-0 left-0 right-0 lg:left-64 z-toolbar p-3 sm:p-4 pointer-events-none flex'
const DOCK_SPRING = { type: 'spring', stiffness: 380, damping: 32 } as const

/**
 * Bulk edit surface, pinned to the bottom of the viewport so it is reachable
 * from anywhere in the list. Outside bulk mode it is a floating "Bulk edit"
 * button. In bulk mode it is a card with two states, each with one primary
 * action: selecting (the action bar, ending in Edit) and editing (the form,
 * ending in Apply). The cards stay visible behind it and animate to their new
 * spots as batches confirm.
 */
export default function BulkEditPanel({ client }: BulkEditPanelProps) {
    const {
        selectedEntries,
        bulkEditMode,
        filteredEntries,
        libraryCount,
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
            libraryCount: s.getCurrentLists().length,
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
    const typeLabel = currentType === MediaType.ANIME ? 'anime' : 'manga'

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
            {/* Floating entry point; hidden while there is nothing to edit */}
            <AnimatePresence>
                {!bulkEditMode && totalCount > 0 && (
                    <m.div
                        className={`${DOCK} justify-end sm:p-6`}
                        initial={{ y: 24, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 24, opacity: 0, transition: { duration: 0.12 } }}
                        transition={DOCK_SPRING}
                    >
                        <button
                            onClick={() => setBulkEditMode(true)}
                            className="btn-tint pointer-events-auto h-12 px-6 rounded-full text-base shadow-overlay ring-1 ring-white/15"
                        >
                            <CheckSquare className="w-5 h-5" />
                            Bulk edit
                        </button>
                    </m.div>
                )}
            </AnimatePresence>

            {/* Floating action bar */}
            <AnimatePresence>
                {bulkEditMode && (
                    <m.div
                        className={`${DOCK} justify-center`}
                        initial={{ y: 96, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 96, opacity: 0 }}
                        transition={DOCK_SPRING}
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
                                        <div className="mb-3">
                                            <h3 className="text-base font-semibold text-fg">
                                                Edit {selectedCount.toLocaleString()} {typeLabel} {selectedCount === 1 ? 'entry' : 'entries'}
                                            </h3>
                                            <p className="text-xs text-fg-muted">Only the fields you change are applied.</p>
                                        </div>
                                        {/* The bottom fade hints that the form scrolls when it is taller than its box */}
                                        <div className="max-h-[50dvh] max-sm:max-h-[60dvh] overflow-y-auto pr-1 pb-6 [mask-image:linear-gradient(to_bottom,black_calc(100%-24px),transparent)]">
                                            <BulkEditForm
                                                options={options}
                                                onChange={setOptions}
                                                user={user}
                                                currentType={currentType}
                                                availableCustomLists={availableCustomLists}
                                                disabled={bulk.isBusy}
                                            />
                                        </div>
                                        <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-edge">
                                            <p className="mr-auto min-w-0 basis-full sm:basis-0 sm:flex-1 text-xs text-fg-muted" aria-live="polite">
                                                {changes.length > 0 ? changes.join(' · ') : 'Pick at least one field to change'}
                                            </p>
                                            <button onClick={() => setFormOpen(false)} className="btn-ghost px-2.5">
                                                <ArrowLeft className="w-4 h-4" />
                                                Back
                                            </button>
                                            <button
                                                onClick={handleApply}
                                                disabled={selectedCount === 0 || !inputValid || changes.length === 0}
                                                className="btn-tint"
                                            >
                                                <Check className="w-4 h-4" />
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
                            ) : formOpen ? null : (
                                <BulkActionBar
                                    selectedCount={selectedCount}
                                    totalCount={totalCount}
                                    allSelected={allSelected}
                                    filtered={totalCount < libraryCount}
                                    onSelectAll={selectAllEntries}
                                    onClearSelection={clearSelection}
                                    onEdit={() => setFormOpen(true)}
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
