import { useState } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { useStore } from '@/store'
import { AniListClient } from '@/lib/anilist'
import { MediaType } from '@/types/anilist'
import { useBulkOperations, BulkFormOptions, EMPTY_BULK_OPTIONS } from '@/hooks/useBulkOperations'
import BulkActionBar from '@/components/bulk/BulkActionBar'
import BulkEditForm from '@/components/bulk/BulkEditForm'
import BulkProgress from '@/components/bulk/BulkProgress'
import PartialFailureBar from '@/components/bulk/PartialFailureBar'
import RelationFinderModal from '@/components/RelationFinderModal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { MediaList } from '@/types/anilist'
import { CheckSquare, Save, X } from 'lucide-react'

interface BulkEditPanelProps {
    client: AniListClient | null
}

/**
 * Bulk edit surface: a slim toggle in the toolbar plus a floating action bar
 * pinned to the bottom of the viewport while bulk mode is active, so the cards
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
    } = useStore()

    const bulk = useBulkOperations(client)
    const [formOpen, setFormOpen] = useState(false)
    const [options, setOptions] = useState<BulkFormOptions>(EMPTY_BULK_OPTIONS)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [relationSeeds, setRelationSeeds] = useState<MediaList[] | null>(null)

    const selectedCount = selectedEntries.size
    const totalCount = filteredEntries.length
    const allSelected = selectedCount === totalCount && totalCount > 0

    const availableCustomLists = (() => {
        if (!user?.mediaListOptions) return []
        const key = currentType === MediaType.ANIME ? 'animeList' : 'mangaList'
        return user.mediaListOptions[key]?.customLists || []
    })()

    const handleApply = async () => {
        await bulk.runBulkUpdate(options)
        setFormOpen(false)
        setOptions(EMPTY_BULK_OPTIONS)
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
            {/* Toolbar row above the grid */}
            <div className="flex items-center justify-between">
                <p className="text-sm text-fg-muted tabular-nums">
                    {totalCount} {totalCount === 1 ? 'entry' : 'entries'}
                </p>
                {!bulkEditMode && (
                    <button onClick={() => setBulkEditMode(true)} className="btn-purple h-11 text-base">
                        <CheckSquare className="w-5 h-5" />
                        Bulk edit
                    </button>
                )}
            </div>

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
                                        <div className="max-h-[50vh] overflow-y-auto pr-1 pb-1">
                                            <BulkEditForm
                                                options={options}
                                                onChange={setOptions}
                                                user={user}
                                                currentType={currentType}
                                                availableCustomLists={availableCustomLists}
                                                disabled={bulk.isBusy}
                                                rateLimiterConfig={bulk.rateLimiterConfig}
                                                onRateLimiterConfigChange={bulk.setRateLimiterConfig}
                                                rateLimiterStats={bulk.rateLimiterStats}
                                            />
                                        </div>
                                        <div className="flex justify-end gap-2 pt-3 border-t border-edge mt-3">
                                            <button onClick={() => setFormOpen(false)} className="btn-secondary h-9 text-sm">
                                                <X className="w-4 h-4" />
                                                Close
                                            </button>
                                            <button
                                                onClick={handleApply}
                                                disabled={selectedCount === 0}
                                                className="btn-primary h-9 text-sm"
                                            >
                                                <Save className="w-4 h-4" />
                                                Apply to {selectedCount} {selectedCount === 1 ? 'entry' : 'entries'}
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
                                    stats={bulk.rateLimiterStats}
                                    isCancelling={bulk.isCancelling}
                                    onCancel={bulk.cancel}
                                />
                            ) : bulk.failedIds.length > 0 ? (
                                <PartialFailureBar
                                    failedCount={bulk.failedIds.length}
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
