import { CheckSquare, Trash2, Edit3, X, GitBranch } from 'lucide-react'

interface BulkActionBarProps {
    selectedCount: number
    totalCount: number
    allSelected: boolean
    /** The list is narrowed by a search or filter, so "all" means the results shown */
    filtered: boolean
    onSelectAll: () => void
    onClearSelection: () => void
    onEdit: () => void
    onDelete: () => void
    onFindRelations: () => void
    onExit: () => void
}

// Sizes are restated with `touch:` because a plain height utility outranks the button class's own touch size
const QUIET = 'btn-ghost h-9 touch:h-11 px-2.5 whitespace-nowrap'

/**
 * Selection state of the bulk bar: what is selected on the first line, what
 * to do with it on the second. On phones the two lines stack, with the actions
 * right-aligned so Edit sits under the thumb; from md up they share one row.
 */
export default function BulkActionBar({
    selectedCount,
    totalCount,
    allSelected,
    filtered,
    onSelectAll,
    onClearSelection,
    onEdit,
    onDelete,
    onFindRelations,
    onExit,
}: BulkActionBarProps) {
    const none = selectedCount === 0

    return (
        <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
            {none ? (
                <span className="px-1.5 text-sm text-fg-muted whitespace-nowrap">Select entries to edit</span>
            ) : (
                /* The count doubles as the way to clear the selection, like a filter chip */
                <button
                    onClick={onClearSelection}
                    className="inline-flex items-center gap-1.5 h-9 touch:h-11 pl-3 pr-2 rounded-lg bg-tint/15 text-sm font-semibold text-fg tabular-nums whitespace-nowrap transition-colors hover:bg-tint/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-tint"
                    title="Clear selection"
                >
                    {selectedCount.toLocaleString()} selected
                    <X className="w-3.5 h-3.5 text-fg-muted" aria-hidden />
                </button>
            )}

            {!allSelected && (
                <button onClick={onSelectAll} className={QUIET}>
                    <CheckSquare className="w-4 h-4" />
                    Select all {totalCount.toLocaleString()}
                    {/* Dropped on phones, where the first line has no room for it */}
                    {filtered && <span className="max-sm:hidden">results</span>}
                </button>
            )}

            <button
                onClick={onExit}
                className={`${QUIET} ml-auto md:order-last md:ml-0`}
                title="Leave bulk edit (clears the selection)"
            >
                Exit
            </button>

            <div className="flex basis-full items-center justify-end gap-1 md:ml-auto md:basis-auto">
                <button
                    onClick={onFindRelations}
                    disabled={none}
                    className={QUIET}
                    title="Find sequels & prequels of the selected entries"
                >
                    <GitBranch className="w-4 h-4" />
                    Sequels
                </button>

                <button
                    onClick={onDelete}
                    disabled={none}
                    className={`${QUIET} text-danger hover:bg-danger/10 hover:text-danger`}
                >
                    <Trash2 className="w-4 h-4" />
                    Delete
                </button>

                <button onClick={onEdit} disabled={none} className="btn-tint h-9 touch:h-11 px-4">
                    <Edit3 className="w-4 h-4" />
                    Edit
                </button>
            </div>
        </div>
    )
}
