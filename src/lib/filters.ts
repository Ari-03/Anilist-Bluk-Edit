import type { FilterOptions } from '@/store'

/** How many filter values are applied, not counting the search text (shown on the Filters button) */
export const activeFilterCount = (filters: FilterOptions): number =>
    (filters.status?.length ?? 0) +
    (filters.genre?.length ?? 0) +
    (filters.format?.length ?? 0) +
    (filters.country?.length ?? 0) +
    (filters.year?.start || filters.year?.end ? 1 : 0) +
    (filters.score?.min || filters.score?.max ? 1 : 0)

/** Sort choices as the user reads them: one control instead of a field plus an Asc/Desc toggle */
export const SORT_OPTIONS = [
    { sortBy: 'title', sortOrder: 'asc', label: 'Title, A to Z' },
    { sortBy: 'title', sortOrder: 'desc', label: 'Title, Z to A' },
    { sortBy: 'score', sortOrder: 'desc', label: 'Score, high to low' },
    { sortBy: 'score', sortOrder: 'asc', label: 'Score, low to high' },
    { sortBy: 'progress', sortOrder: 'desc', label: 'Progress, most first' },
    { sortBy: 'progress', sortOrder: 'asc', label: 'Progress, least first' },
    { sortBy: 'startDate', sortOrder: 'desc', label: 'Start date, newest first' },
    { sortBy: 'startDate', sortOrder: 'asc', label: 'Start date, oldest first' },
    { sortBy: 'updatedAt', sortOrder: 'desc', label: 'Last updated, newest first' },
    { sortBy: 'updatedAt', sortOrder: 'asc', label: 'Last updated, oldest first' },
] as const satisfies ReadonlyArray<Required<Pick<FilterOptions, 'sortBy' | 'sortOrder'>> & { label: string }>
