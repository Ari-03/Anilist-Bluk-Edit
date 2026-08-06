import { useState } from 'react'
import { useStore } from '@/store'
import { MediaType } from '@/types/anilist'
import { getScoreRange } from '@/lib/scoreFormat'
import { PopoverPosition } from '@/components/ui/Popover'
import FilterSection from '@/components/sidebar/FilterSection'
import StatusFilter from '@/components/sidebar/StatusFilter'
import GenreFilter from '@/components/sidebar/GenreFilter'
import FormatFilter from '@/components/sidebar/FormatFilter'
import CountryFilter from '@/components/sidebar/CountryFilter'
import RangeFilter from '@/components/sidebar/RangeFilter'
import {
    Search,
    X,
    Filter,
    Star,
    Calendar,
    Globe,
    Tag,
    Tags,
    Tv,
    BookOpen,
    Grid3X3,
    List,
    ArrowUpDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const POPOVER_WIDTH = 320

export default function SidebarContent() {
    const {
        currentType,
        setCurrentType,
        viewMode,
        setViewMode,
        filters,
        setFilters,
        clearFilters,
        user,
        getCurrentLists,
    } = useStore()

    const [activePopout, setActivePopout] = useState<string | null>(null)
    const [popoutPosition, setPopoutPosition] = useState<PopoverPosition | null>(null)

    const togglePopout = (section: string) => (event: React.MouseEvent<HTMLButtonElement>) => {
        if (activePopout === section) {
            setActivePopout(null)
            setPopoutPosition(null)
            return
        }
        const rect = event.currentTarget.getBoundingClientRect()
        const vw = window.innerWidth
        const vh = window.innerHeight
        let top = rect.top
        let left = rect.right + 8
        // On narrow screens the popout won't fit to the right — drop it below
        if (left + POPOVER_WIDTH > vw - 8) {
            left = Math.max(8, Math.min(rect.left, vw - POPOVER_WIDTH - 8))
            top = rect.bottom + 8
        }
        top = Math.max(8, Math.min(top, vh - 120))
        setActivePopout(section)
        setPopoutPosition({ top, left })
    }

    const closePopout = () => {
        setActivePopout(null)
        setPopoutPosition(null)
    }

    const sectionProps = (id: string) => ({
        open: activePopout === id,
        position: popoutPosition,
        onTrigger: togglePopout(id),
        onClose: closePopout,
    })

    // Year bounds from the actual library
    const lists = getCurrentLists()
    const currentYear = new Date().getFullYear()
    const years = lists
        .map(e => e.media?.startDate?.year || e.media?.seasonYear)
        .filter((y): y is number => y != null)
    const yearRange = {
        min: years.length ? Math.min(...years) : 1975,
        max: years.length ? Math.max(...years, currentYear + 1) : currentYear + 1,
    }
    const scoreRange = getScoreRange(user?.mediaListOptions?.scoreFormat)

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

    const segmented = (
        options: Array<{ value: string; label: string; icon: React.ReactNode }>,
        current: string,
        onSelect: (value: string) => void
    ) => (
        <div className="flex bg-raised rounded-lg p-1">
            {options.map(opt => (
                <button
                    key={opt.value}
                    onClick={() => onSelect(opt.value)}
                    className={cn(
                        'flex-1 flex items-center justify-center gap-1.5 h-8 rounded-md text-xs font-semibold transition-all duration-150',
                        current === opt.value
                            ? 'bg-surface text-fg shadow-card'
                            : 'text-fg-muted hover:text-fg'
                    )}
                >
                    {opt.icon}
                    {opt.label}
                </button>
            ))}
        </div>
    )

    return (
        <div className="p-4 space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-fg uppercase tracking-wide flex items-center gap-2">
                    <Filter className="h-4 w-4 text-accent" />
                    Filters
                </h2>
                {hasActiveFilters && (
                    <button
                        onClick={clearFilters}
                        className="text-xs font-medium text-danger hover:underline"
                    >
                        Clear all
                    </button>
                )}
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle" />
                <input
                    type="text"
                    placeholder="Search titles…"
                    value={filters.search || ''}
                    onChange={(e) => setFilters({ search: e.target.value })}
                    className="input pl-9 pr-8"
                />
                {filters.search && (
                    <button
                        onClick={() => setFilters({ search: '' })}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>

            {/* Media type */}
            {segmented(
                [
                    { value: MediaType.ANIME, label: 'Anime', icon: <Tv className="h-3.5 w-3.5" /> },
                    { value: MediaType.MANGA, label: 'Manga', icon: <BookOpen className="h-3.5 w-3.5" /> },
                ],
                currentType,
                (v) => setCurrentType(v as MediaType)
            )}

            {/* Sort */}
            <div className="space-y-2">
                <label className="text-xs font-semibold text-fg-muted uppercase tracking-wide">Sort</label>
                <div className="flex gap-2">
                    <select
                        value={filters.sortBy || 'title'}
                        onChange={(e) => setFilters({ sortBy: e.target.value as any })}
                        className="select flex-1 text-sm"
                    >
                        <option value="title">Title</option>
                        <option value="score">Score</option>
                        <option value="progress">Progress</option>
                        <option value="startDate">Start date</option>
                        <option value="updatedAt">Last updated</option>
                    </select>
                    <button
                        onClick={() => setFilters({ sortOrder: filters.sortOrder === 'asc' ? 'desc' : 'asc' })}
                        className="btn-secondary h-10 px-3 text-xs whitespace-nowrap"
                        title={filters.sortOrder === 'desc' ? 'Descending' : 'Ascending'}
                    >
                        <ArrowUpDown className="h-3.5 w-3.5" />
                        {filters.sortOrder === 'desc' ? 'Desc' : 'Asc'}
                    </button>
                </div>
            </div>

            {/* Filter sections */}
            <div className="space-y-0.5">
                <FilterSection
                    icon={<Tag className="h-4 w-4" />}
                    label="Status"
                    badge={filters.status?.length || null}
                    {...sectionProps('status')}
                >
                    <StatusFilter />
                </FilterSection>

                <FilterSection
                    icon={<Tags className="h-4 w-4" />}
                    label="Genre"
                    badge={filters.genre?.length || null}
                    {...sectionProps('genre')}
                >
                    <GenreFilter />
                </FilterSection>

                <FilterSection
                    icon={currentType === MediaType.ANIME ? <Tv className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
                    label="Format"
                    badge={filters.format?.length || null}
                    {...sectionProps('format')}
                >
                    <FormatFilter />
                </FilterSection>

                <FilterSection
                    icon={<Globe className="h-4 w-4" />}
                    label="Country"
                    badge={filters.country?.length || null}
                    {...sectionProps('country')}
                >
                    <CountryFilter />
                </FilterSection>

                <FilterSection
                    icon={<Calendar className="h-4 w-4" />}
                    label="Year"
                    badge={
                        filters.year?.start || filters.year?.end
                            ? `${filters.year.start || yearRange.min}–${filters.year.end || yearRange.max}`
                            : null
                    }
                    {...sectionProps('year')}
                >
                    <RangeFilter
                        title="Year range"
                        min={yearRange.min}
                        max={yearRange.max}
                        value={[filters.year?.start || yearRange.min, filters.year?.end || yearRange.max]}
                        onChange={([start, end]) => setFilters({ year: { start, end } })}
                    />
                </FilterSection>

                <FilterSection
                    icon={<Star className="h-4 w-4" />}
                    label="Score"
                    badge={
                        filters.score?.min || filters.score?.max
                            ? `${filters.score.min || scoreRange.min}–${filters.score.max || scoreRange.max}`
                            : null
                    }
                    {...sectionProps('score')}
                >
                    <RangeFilter
                        title="Score range"
                        min={scoreRange.min}
                        max={scoreRange.max}
                        step={scoreRange.step}
                        value={[filters.score?.min || scoreRange.min, filters.score?.max || scoreRange.max]}
                        onChange={([min, max]) => setFilters({ score: { min, max } })}
                        fromLabel="Min"
                        toLabel="Max"
                    />
                </FilterSection>
            </div>

            {/* View mode */}
            <div className="pt-4 border-t border-edge space-y-2">
                <label className="text-xs font-semibold text-fg-muted uppercase tracking-wide">View</label>
                {segmented(
                    [
                        { value: 'grid', label: 'Grid', icon: <Grid3X3 className="h-3.5 w-3.5" /> },
                        { value: 'list', label: 'List', icon: <List className="h-3.5 w-3.5" /> },
                    ],
                    viewMode,
                    (v) => setViewMode(v as 'grid' | 'list')
                )}
            </div>
        </div>
    )
}
