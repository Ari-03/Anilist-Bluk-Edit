import { MediaType } from '@/types/anilist'
import { Play, Book, SearchX, RotateCcw, FilterX } from 'lucide-react'

interface EmptyStateProps {
    currentType: MediaType
    /** True when the library itself is empty (vs. no filter matches) */
    libraryEmpty: boolean
    hasActiveFilters: boolean
    isRefreshing?: boolean
    onRefresh: () => void
    onClearFilters: () => void
}

export default function EmptyState({
    currentType,
    libraryEmpty,
    hasActiveFilters,
    isRefreshing,
    onRefresh,
    onClearFilters,
}: EmptyStateProps) {
    const TypeIcon = currentType === MediaType.ANIME ? Play : Book

    if (libraryEmpty) {
        return (
            <div className="flex flex-col items-center text-center py-20 px-4">
                <div className="w-16 h-16 rounded-2xl bg-raised flex items-center justify-center mb-4">
                    <TypeIcon className="w-8 h-8 text-fg-subtle" />
                </div>
                <h3 className="text-base font-semibold text-fg">Nothing here yet</h3>
                <p className="mt-1 text-sm text-fg-muted max-w-sm">
                    Your {currentType === MediaType.ANIME ? 'anime' : 'manga'} list looks empty. If that
                    doesn&apos;t sound right, try refreshing — a connection hiccup or privacy settings can
                    block loading.
                </p>
                <button onClick={onRefresh} disabled={isRefreshing} className="btn-primary mt-5">
                    <RotateCcw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    Refresh lists
                </button>
            </div>
        )
    }

    return (
        <div className="flex flex-col items-center text-center py-20 px-4">
            <div className="w-16 h-16 rounded-2xl bg-raised flex items-center justify-center mb-4">
                <SearchX className="w-8 h-8 text-fg-subtle" />
            </div>
            <h3 className="text-base font-semibold text-fg">No matches</h3>
            <p className="mt-1 text-sm text-fg-muted max-w-sm">
                Nothing in your {currentType === MediaType.ANIME ? 'anime' : 'manga'} list matches the
                current filters.
            </p>
            {hasActiveFilters && (
                <button onClick={onClearFilters} className="btn-secondary mt-5">
                    <FilterX className="w-4 h-4" />
                    Clear filters
                </button>
            )}
        </div>
    )
}
