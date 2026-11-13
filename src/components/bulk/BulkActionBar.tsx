import { CheckSquare, Square, Trash2, Edit3, Check, ChevronUp, GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BulkActionBarProps {
    selectedCount: number
    totalCount: number
    allSelected: boolean
    formOpen: boolean
    onSelectAll: () => void
    onClearSelection: () => void
    onToggleForm: () => void
    onDelete: () => void
    onFindRelations: () => void
    onExit: () => void
}

export default function BulkActionBar({
    selectedCount,
    totalCount,
    allSelected,
    formOpen,
    onSelectAll,
    onClearSelection,
    onToggleForm,
    onDelete,
    onFindRelations,
    onExit,
}: BulkActionBarProps) {
    return (
        /* Wraps to two rows on phones: selection on top, actions below */
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:gap-y-2">
            <span className="text-sm font-semibold text-fg tabular-nums whitespace-nowrap">
                {selectedCount > 0 ? (
                    <>{selectedCount.toLocaleString()} selected</>
                ) : (
                    <span className="text-fg-muted font-normal">Tap cards to select</span>
                )}
            </span>

            <div className="hidden sm:block h-5 w-px bg-edge mx-1" />

            <button
                onClick={allSelected ? onClearSelection : onSelectAll}
                className="btn-ghost h-8 px-2.5 text-xs whitespace-nowrap"
            >
                {allSelected ? <Square className="w-3.5 h-3.5" /> : <CheckSquare className="w-3.5 h-3.5" />}
                {allSelected ? 'Deselect all' : `Select all (${totalCount.toLocaleString()})`}
            </button>

            {selectedCount > 0 && !allSelected && (
                <button onClick={onClearSelection} className="btn-ghost h-8 px-2.5 text-xs">
                    Clear
                </button>
            )}

            <div className="flex-1 basis-full sm:basis-0" />

            <button
                onClick={onFindRelations}
                disabled={selectedCount === 0}
                className="btn-ghost h-8 px-2.5 text-xs disabled:opacity-40"
                title="Find sequels & prequels of the selected entries"
            >
                <GitBranch className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sequels</span>
            </button>

            <button
                onClick={onDelete}
                disabled={selectedCount === 0}
                className="btn-ghost h-8 px-2.5 text-xs text-danger hover:bg-danger/10 hover:text-danger disabled:opacity-40"
            >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
            </button>

            <button
                onClick={onToggleForm}
                disabled={selectedCount === 0}
                className={cn('btn-purple h-8 px-3 text-xs', formOpen && 'bg-purple-hover')}
            >
                {formOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                Edit
            </button>

            <button onClick={onExit} className="btn-ghost h-8 px-2.5 text-xs" title="Leave bulk edit (clears the selection)">
                <Check className="w-3.5 h-3.5" />
                Done
            </button>
        </div>
    )
}
