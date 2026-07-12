import type { AccountMediaPreferences, PreferenceValue } from '@/modules/accounts'
import { createDefaultListQuery, type ListQuery } from '@/modules/media-list'
import { MediaFormat, MediaListStatus } from '@/types/anilist'

const statusValues = new Set<string>(Object.values(MediaListStatus))
const formatValues = new Set<string>(Object.values(MediaFormat))

const stringArray = (value: PreferenceValue | undefined): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []

const optionalNumber = (value: PreferenceValue | undefined): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

export function queryToPreferences(
  query: ListQuery,
  viewMode: AccountMediaPreferences['viewMode'] = 'grid',
): AccountMediaPreferences {
  return {
    filters: {
      statuses: [...query.statuses],
      customLists: [...query.customLists],
      formats: [...query.formats],
      genres: [...query.genres],
      countries: [...query.countries],
      yearMin: query.year.min ?? null,
      yearMax: query.year.max ?? null,
      scoreMin: query.score.min ?? null,
      scoreMax: query.score.max ?? null,
      search: query.search,
      sortField: query.sort.field,
      sortDirection: query.sort.direction,
      includeHidden: query.includeHidden ?? false,
    },
    viewMode,
    pageSize: query.pageSize,
  }
}

export function viewModeFromPreferences(
  preferences?: AccountMediaPreferences,
): AccountMediaPreferences['viewMode'] {
  return preferences?.viewMode === 'list' ? 'list' : 'grid'
}

export function queryFromPreferences(
  preferences?: AccountMediaPreferences,
): ListQuery {
  const query = createDefaultListQuery()
  if (!preferences) return query
  const values = preferences.filters
  const sortField = values.sortField
  const sortDirection = values.sortDirection

  return {
    ...query,
    statuses: stringArray(values.statuses).filter(
      (value): value is MediaListStatus => statusValues.has(value),
    ),
    customLists: stringArray(values.customLists),
    formats: stringArray(values.formats).filter(
      (value): value is MediaFormat => formatValues.has(value),
    ),
    genres: stringArray(values.genres),
    countries: stringArray(values.countries),
    year: {
      min: optionalNumber(values.yearMin),
      max: optionalNumber(values.yearMax),
    },
    score: {
      min: optionalNumber(values.scoreMin),
      max: optionalNumber(values.scoreMax),
    },
    search: typeof values.search === 'string' ? values.search : '',
    sort: {
      field:
        sortField === 'title' ||
        sortField === 'score' ||
        sortField === 'progress' ||
        sortField === 'startedAt' ||
        sortField === 'updatedAt'
          ? sortField
          : 'title',
      direction: sortDirection === 'desc' ? 'desc' : 'asc',
    },
    page: 1,
    pageSize: preferences.pageSize,
    includeHidden: values.includeHidden === true,
  }
}
