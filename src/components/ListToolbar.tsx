import { useStore } from '@/store'
import { MediaType } from '@/types/anilist'
import { cn } from '@/lib/utils'
import { CheckSquare, Grid3X3, List, Search, X } from 'lucide-react'

/**
 * Heading row above the list: what's shown, title search, grid/list toggle and
 * the entry point into bulk edit. Filters live in the sidebar.
 */
export default function ListToolbar() {
    const currentType = useStore(s => s.currentType)
    const shown = useStore(s => s.filteredEntries.length)
    const total = useStore(s => s.getCurrentLists().length)
    const search = useStore(s => s.filters.search ?? '')
    const setSearch = useStore(s => s.setSearch)
    const viewMode = useStore(s => s.viewMode)
    const setViewMode = useStore(s => s.setViewMode)
    const bulkEditMode = useStore(s => s.bulkEditMode)
    const setBulkEditMode = useStore(s => s.setBulkEditMode)

    const count = (n: number) => n.toLocaleString()
    const views = [
        { value: 'grid', label: 'Grid view', icon: Grid3X3 },
        { value: 'list', label: 'List view', icon: List },
    ] as const

    return (
        <div className="flex flex-wrap items-center gap-3">
            <div className="mr-auto min-w-0">
                <h2 className="text-lg font-bold text-fg leading-tight">
                    {currentType === MediaType.ANIME ? 'Anime' : 'Manga'}
                </h2>
                <p className="text-xs text-fg-muted tabular-nums">
                    {shown === total
                        ? `${count(total)} ${total === 1 ? 'entry' : 'entries'}`
                        : `${count(shown)} of ${count(total)} entries`}
                </p>
            </div>

            <div className="relative order-last w-full sm:order-none sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle" aria-hidden />
                <input
                    type="search"
                    placeholder="Search titles…"
                    aria-label="Search titles"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="input pl-9 pr-8"
                />
                {search && (
                    <button
                        onClick={() => setSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg"
                        aria-label="Clear search"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>

            <div className="flex bg-raised border border-edge rounded-lg p-0.5" role="group" aria-label="Layout">
                {views.map(({ value, label, icon: Icon }) => (
                    <button
                        key={value}
                        onClick={() => setViewMode(value)}
                        aria-pressed={viewMode === value}
                        title={label}
                        className={cn(
                            'flex items-center justify-center w-9 h-8 rounded-md transition-colors',
                            viewMode === value ? 'bg-surface text-fg shadow-card' : 'text-fg-muted hover:text-fg'
                        )}
                    >
                        <Icon className="h-4 w-4" />
                    </button>
                ))}
            </div>

            {!bulkEditMode && (
                <button onClick={() => setBulkEditMode(true)} className="btn-secondary">
                    <CheckSquare className="w-4 h-4" />
                    Bulk edit
                </button>
            )}
        </div>
    )
}
