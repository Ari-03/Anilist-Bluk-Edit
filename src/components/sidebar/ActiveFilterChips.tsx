import { AnimatePresence, m } from 'framer-motion'
import { useStore } from '@/store'
import { MediaListStatus, MediaType } from '@/types/anilist'
import { getStatusLabel } from '@/lib/anilist'
import { COUNTRIES } from '@/components/sidebar/CountryFilter'
import { formatMediaFormat } from '@/lib/entryDisplay'
import { X } from 'lucide-react'

interface Chip {
    key: string
    label: string
    onRemove: () => void
}

/** Dismissible summary of every active filter, shown above the grid */
export default function ActiveFilterChips() {
    const { filters, setFilters, clearFilters, currentType } = useStore()

    const chips: Chip[] = []

    if (filters.search) {
        chips.push({
            key: 'search',
            label: `“${filters.search}”`,
            onRemove: () => setFilters({ search: '' }),
        })
    }
    for (const status of filters.status || []) {
        const isStandard = Object.values(MediaListStatus).includes(status as MediaListStatus)
        chips.push({
            key: `status-${status}`,
            label: isStandard ? getStatusLabel(status as MediaListStatus, currentType) : status,
            onRemove: () => setFilters({ status: (filters.status || []).filter(s => s !== status) }),
        })
    }
    for (const genre of filters.genre || []) {
        chips.push({
            key: `genre-${genre}`,
            label: genre,
            onRemove: () => setFilters({ genre: (filters.genre || []).filter(g => g !== genre) }),
        })
    }
    for (const format of filters.format || []) {
        chips.push({
            key: `format-${format}`,
            label: formatMediaFormat(format),
            onRemove: () => setFilters({ format: (filters.format || []).filter(f => f !== format) }),
        })
    }
    for (const country of filters.country || []) {
        chips.push({
            key: `country-${country}`,
            label: COUNTRIES.find(c => c.value === country)?.label || country,
            onRemove: () => setFilters({ country: (filters.country || []).filter(c => c !== country) }),
        })
    }
    if (filters.year?.start || filters.year?.end) {
        chips.push({
            key: 'year',
            label: `${filters.year.start ?? '…'}–${filters.year.end ?? '…'}`,
            onRemove: () => setFilters({ year: undefined }),
        })
    }
    if (filters.score?.min || filters.score?.max) {
        chips.push({
            key: 'score',
            label: `★ ${filters.score.min ?? 0}–${filters.score.max ?? '…'}`,
            onRemove: () => setFilters({ score: undefined }),
        })
    }

    if (chips.length === 0) return null

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            <AnimatePresence initial={false}>
                {chips.map(chip => (
                    <m.button
                        key={chip.key}
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.12 }}
                        onClick={chip.onRemove}
                        className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1.5 rounded-full bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 transition-colors"
                        title="Remove filter"
                    >
                        {chip.label}
                        <X className="w-3 h-3" />
                    </m.button>
                ))}
            </AnimatePresence>
            {chips.length > 1 && (
                <button
                    onClick={clearFilters}
                    className="h-7 px-2.5 rounded-full text-xs font-medium text-fg-muted hover:text-danger hover:bg-danger/10 transition-colors"
                >
                    Clear all
                </button>
            )}
        </div>
    )
}
