import type { MediaListEntry, ListProjection, ListQuery } from './types'

const DEFAULT_QUERY: ListQuery = {
  statuses: [],
  customLists: [],
  formats: [],
  genres: [],
  countries: [],
  year: {},
  score: {},
  search: '',
  sort: { field: 'title', direction: 'asc' },
  page: 1,
  pageSize: 100,
  includeHidden: false,
}

export function createDefaultListQuery(): ListQuery {
  return {
    ...DEFAULT_QUERY,
    statuses: [],
    customLists: [],
    formats: [],
    genres: [],
    countries: [],
    year: {},
    score: {},
    sort: { ...DEFAULT_QUERY.sort },
  }
}

function titleOf(entry: MediaListEntry): string {
  const title = entry.media?.title
  return (
    title?.userPreferred ?? title?.romaji ?? title?.english ?? title?.native ?? ''
  )
}

function searchableTitles(entry: MediaListEntry): readonly string[] {
  const title = entry.media?.title
  return [
    title?.userPreferred,
    title?.romaji,
    title?.english,
    title?.native,
  ].filter((value): value is string => value !== undefined)
}

function yearOf(entry: MediaListEntry): number | undefined {
  return entry.media?.startDate?.year ?? entry.media?.seasonYear
}

function fuzzyDateValue(entry: MediaListEntry): number {
  const date = entry.startedAt
  return (date?.year ?? 0) * 10_000 + (date?.month ?? 0) * 100 + (date?.day ?? 0)
}

function includesEntry(entry: MediaListEntry, query: ListQuery): boolean {
  if (!query.includeHidden && entry.hiddenFromStatusLists) return false

  if (
    query.statuses.length > 0 &&
    (!entry.status || !query.statuses.includes(entry.status))
  ) {
    return false
  }

  if (
    query.customLists.length > 0 &&
    !query.customLists.some((name) => entry.customLists?.[name] === true)
  ) {
    return false
  }

  if (
    query.formats.length > 0 &&
    (!entry.media?.format || !query.formats.includes(entry.media.format))
  ) {
    return false
  }

  if (
    query.genres.length > 0 &&
    !entry.media?.genres?.some((genre) => query.genres.includes(genre))
  ) {
    return false
  }

  if (
    query.countries.length > 0 &&
    (!entry.media?.countryOfOrigin ||
      !query.countries.includes(entry.media.countryOfOrigin))
  ) {
    return false
  }

  const hasYearRange = query.year.min !== undefined || query.year.max !== undefined
  if (hasYearRange) {
    const year = yearOf(entry)
    if (year === undefined) return false
    if (query.year.min !== undefined && year < query.year.min) return false
    if (query.year.max !== undefined && year > query.year.max) return false
  }

  const hasScoreRange =
    query.score.min !== undefined || query.score.max !== undefined
  if (hasScoreRange) {
    const score = entry.score ?? 0
    if (query.score.min !== undefined && score < query.score.min) return false
    if (query.score.max !== undefined && score > query.score.max) return false
  }

  const search = query.search.trim().toLowerCase()
  if (
    search &&
    !searchableTitles(entry).some((title) => title.toLowerCase().includes(search))
  ) {
    return false
  }

  return true
}

function compareStrings(left: string, right: string): number {
  const normalizedLeft = left.toLowerCase()
  const normalizedRight = right.toLowerCase()
  if (normalizedLeft < normalizedRight) return -1
  if (normalizedLeft > normalizedRight) return 1
  return 0
}

function compareByField(
  left: MediaListEntry,
  right: MediaListEntry,
  query: ListQuery,
): number {
  switch (query.sort.field) {
    case 'title':
      return compareStrings(titleOf(left), titleOf(right))
    case 'score':
      return (left.score ?? 0) - (right.score ?? 0)
    case 'progress':
      return (left.progress ?? 0) - (right.progress ?? 0)
    case 'startedAt':
      return fuzzyDateValue(left) - fuzzyDateValue(right)
    case 'updatedAt':
      return (left.updatedAt ?? 0) - (right.updatedAt ?? 0)
  }
}

/**
 * Filter and sort IDs rather than mutating the canonical entry array. Mapping IDs
 * back to entries also makes the final entry-ID tie-break explicit and stable.
 */
export function filterAndSortEntryIds(
  entries: readonly MediaListEntry[],
  query: ListQuery,
): readonly number[] {
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]))
  const ids = entries
    .filter((entry) => includesEntry(entry, query))
    .map(({ id }) => id)

  ids.sort((leftId, rightId) => {
    // IDs are produced from this same map immediately above.
    const left = entriesById.get(leftId) as MediaListEntry
    const right = entriesById.get(rightId) as MediaListEntry

    const fieldOrder = compareByField(left, right, query)
    if (fieldOrder !== 0) {
      return query.sort.direction === 'asc' ? fieldOrder : -fieldOrder
    }
    return leftId - rightId
  })

  return ids
}

export function projectList(
  entries: readonly MediaListEntry[],
  query: ListQuery,
): ListProjection {
  return projectListWithIds(entries, query).projection
}

export function projectListWithIds(
  entries: readonly MediaListEntry[],
  query: ListQuery,
): { projection: ListProjection; filteredEntryIds: readonly number[] } {
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]))
  const ids = filterAndSortEntryIds(entries, query)
  const totalEntries = ids.length
  const pageCount = Math.max(1, Math.ceil(totalEntries / query.pageSize))
  const requestedPage = Number.isFinite(query.page) ? Math.trunc(query.page) : 1
  const page = Math.min(Math.max(requestedPage, 1), pageCount)
  const start = (page - 1) * query.pageSize
  const pageEntries = ids
    .slice(start, start + query.pageSize)
    .map((id) => entriesById.get(id) as MediaListEntry)

  return {
    projection: {
      entries: pageEntries,
      totalEntries,
      page,
      pageCount,
    },
    filteredEntryIds: ids,
  }
}
