import { useStore } from '@/store'
import { MediaType } from '@/types/anilist'
import { activeFilterCount, SORT_OPTIONS } from '@/lib/filters'
import { cn } from '@/lib/utils'
import { ArrowUpDown, BookOpen, Grid3X3, List, Search, SlidersHorizontal, Tv, X } from 'lucide-react'

interface ListToolbarProps {
    /** Opens the filter drawer (below lg, where the sidebar is not inline) */
    onOpenFilters: () => void
}

const TYPES = [
    { value: MediaType.ANIME, label: 'Anime', icon: Tv },
    { value: MediaType.MANGA, label: 'Manga', icon: BookOpen },
] as const

const VIEWS = [
    { value: 'grid', label: 'Grid view', icon: Grid3X3 },
    { value: 'list', label: 'List view', icon: List },
] as const

const segment = (active: boolean) =>
    cn(
        'flex items-center justify-center gap-1.5 rounded-md text-sm font-semibold transition-colors',
        active ? 'bg-surface text-fg shadow-card' : 'text-fg-muted hover:text-fg'
    )

/**
 * Everything that describes the list as a whole, in one bar above it: which
 * library (Anime/Manga), how many entries are shown, title search, sort and
 * the grid/list toggle. Filters live in the sidebar (a drawer below lg, opened
 * from here); bulk edit is entered from the floating button in BulkEditPanel.
 */
export default function ListToolbar({ onOpenFilters }: ListToolbarProps) {
    const currentType = useStore(s => s.currentType)
    const setCurrentType = useStore(s => s.setCurrentType)
    const shown = useStore(s => s.filteredEntries.length)
    const total = useStore(s => s.getCurrentLists().length)
    const filters = useStore(s => s.filters)
    const setFilters = useStore(s => s.setFilters)
    const setSearch = useStore(s => s.setSearch)
    const viewMode = useStore(s => s.viewMode)
    const setViewMode = useStore(s => s.setViewMode)

    const search = filters.search ?? ''
    const filterCount = activeFilterCount(filters)
    const sortIndex = Math.max(
        0,
        SORT_OPTIONS.findIndex(o => o.sortBy === (filters.sortBy ?? 'title') && o.sortOrder === (filters.sortOrder ?? 'asc'))
    )
    const count = (n: number) => n.toLocaleString()

    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
            <h2 className="sr-only">{currentType === MediaType.ANIME ? 'Anime' : 'Manga'} list</h2>

            <div className="flex bg-raised border border-edge rounded-lg p-0.5" role="group" aria-label="Library">
                {TYPES.map(({ value, label, icon: Icon }) => (
                    <button
                        key={value}
                        onClick={() => setCurrentType(value)}
                        aria-pressed={currentType === value}
                        className={cn(segment(currentType === value), 'h-9 px-3.5 touch:h-11')}
                    >
                        <Icon className="hidden sm:block h-4 w-4" aria-hidden />
                        {label}
                    </button>
                ))}
            </div>

            <p className="mr-auto text-sm text-fg-muted tabular-nums">
                {shown === total
                    ? `${count(total)} ${total === 1 ? 'entry' : 'entries'}`
                    : `${count(shown)} of ${count(total)}`}
            </p>

            {/* Search, sort and filters take their own full-width row until there is room for one line (xl) */}
            <div className="order-last flex w-full items-center gap-2 xl:order-none xl:w-auto">
                <div className="relative min-w-0 flex-1 xl:w-64 xl:flex-none">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle" aria-hidden />
                    <input
                        type="search"
                        placeholder="Search titles…"
                        aria-label="Search titles"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="input pl-9 pr-9"
                    />
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            className="absolute right-0 top-0 flex h-full w-9 items-center justify-center text-fg-subtle hover:text-fg"
                            aria-label="Clear search"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                {/* Icon-sized on phones: the native picker opens from the transparent select on top */}
                <div className="relative flex-shrink-0">
                    <ArrowUpDown
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted max-sm:left-1/2 max-sm:-translate-x-1/2"
                        aria-hidden
                    />
                    <select
                        aria-label="Sort"
                        value={sortIndex}
                        onChange={(e) => {
                            const { sortBy, sortOrder } = SORT_OPTIONS[Number(e.target.value)]
                            setFilters({ sortBy, sortOrder })
                        }}
                        className="select w-56 pl-9 max-sm:w-11 max-sm:bg-none max-sm:px-0 max-sm:text-transparent"
                    >
                        {SORT_OPTIONS.map((option, i) => (
                            <option key={option.label} value={i} className="text-fg">
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>

                <button onClick={onOpenFilters} className="btn-secondary relative flex-shrink-0 px-3 touch:min-w-11 lg:hidden">
                    <SlidersHorizontal className="h-4 w-4" />
                    <span className="max-sm:sr-only">Filters</span>
                    {filterCount > 0 && (
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-strong px-1.5 text-xs font-semibold text-on-accent tabular-nums max-sm:absolute max-sm:-right-1.5 max-sm:-top-1.5">
                            {filterCount}
                        </span>
                    )}
                </button>
            </div>

            {/* The phone's sort control is icon-sized, so the current order is spelled out here */}
            <p className="order-last -mt-1 w-full text-xs text-fg-subtle sm:hidden">
                Sorted by {SORT_OPTIONS[sortIndex].label.replace(/^./, c => c.toLowerCase())}
            </p>

            <div className="flex bg-raised border border-edge rounded-lg p-0.5" role="group" aria-label="Layout">
                {VIEWS.map(({ value, label, icon: Icon }) => (
                    <button
                        key={value}
                        onClick={() => setViewMode(value)}
                        aria-pressed={viewMode === value}
                        title={label}
                        aria-label={label}
                        className={cn(segment(viewMode === value), 'h-9 w-9 touch:h-11 touch:w-11')}
                    >
                        <Icon className="h-4 w-4" />
                    </button>
                ))}
            </div>
        </div>
    )
}
