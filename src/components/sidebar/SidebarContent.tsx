import { useState } from 'react'
import { selectCurrentLists, useStore } from '@/store'
import { useShallow } from 'zustand/react/shallow'
import { MediaType } from '@/types/anilist'
import { getScoreRange } from '@/lib/scoreFormat'
import FilterSection from '@/components/sidebar/FilterSection'
import StatusFilter from '@/components/sidebar/StatusFilter'
import GenreFilter from '@/components/sidebar/GenreFilter'
import FormatFilter from '@/components/sidebar/FormatFilter'
import CountryFilter from '@/components/sidebar/CountryFilter'
import RangeFilter from '@/components/sidebar/RangeFilter'
import { Star, Calendar, Globe, CircleDot, Tags, Tv, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarContentProps {
    /** Open each filter in place (the drawer) rather than in a flyout beside the sidebar */
    inline?: boolean
}

/** The filter list: one row per filter, shared by the desktop sidebar and the drawer */
export default function SidebarContent({ inline = false }: SidebarContentProps) {
    const {
        currentType,
        filters,
        setFilters,
        clearFilters,
        user,
        currentLists,
    } = useStore(
        useShallow(s => ({
            currentType: s.currentType,
            filters: s.filters,
            setFilters: s.setFilters,
            clearFilters: s.clearFilters,
            user: s.user,
            currentLists: selectCurrentLists(s),
        }))
    )

    const [activePopout, setActivePopout] = useState<string | null>(null)
    const sectionProps = (id: string) => ({
        inline,
        open: activePopout === id,
        onOpenChange: (open: boolean) => setActivePopout(open ? id : null),
    })

    // Year bounds from the actual library
    const lists = currentLists
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

    return (
        <div className="p-4 space-y-3">
            {/* The drawer's close button sits in the top-right corner */}
            <div className={cn('flex items-center justify-between h-6', inline && 'pr-10')}>
                <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wide">Filters</h2>
                {hasActiveFilters && (
                    <button
                        onClick={clearFilters}
                        className="text-xs font-medium text-accent-strong hover:underline"
                    >
                        Clear all
                    </button>
                )}
            </div>

            {/* Filter sections */}
            <div className="space-y-0.5">
                <FilterSection
                    icon={<CircleDot className="h-4 w-4" />}
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

        </div>
    )
}
