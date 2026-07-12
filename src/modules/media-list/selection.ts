import type {
  CollectionKey,
  ListQuery,
  MediaListEntryId,
  ScopedSelection,
} from './types'

function sortedUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort()
}

export function createListQueryFingerprint(query: ListQuery): string {
  return JSON.stringify({
    statuses: sortedUnique(query.statuses),
    customLists: sortedUnique(query.customLists),
    formats: sortedUnique(query.formats),
    genres: sortedUnique(query.genres),
    countries: sortedUnique(query.countries),
    year: { min: query.year.min ?? null, max: query.year.max ?? null },
    score: { min: query.score.min ?? null, max: query.score.max ?? null },
    search: query.search.trim().toLowerCase(),
    sort: query.sort,
    pageSize: query.pageSize,
    includeHidden: query.includeHidden ?? false,
  })
}

export function createSelectionScope(
  key: CollectionKey,
  query: ListQuery,
): string {
  return `${key.accountId}:${key.mediaType}:${createListQueryFingerprint(query)}`
}

export function createScopedSelection(
  key: CollectionKey,
  query: ListQuery,
  entryIds: Iterable<MediaListEntryId> = [],
): ScopedSelection {
  return {
    scope: createSelectionScope(key, query),
    entryIds: new Set(entryIds),
  }
}

export function reconcileSelectionScope(
  selection: ScopedSelection,
  key: CollectionKey,
  query: ListQuery,
): ScopedSelection {
  const scope = createSelectionScope(key, query)
  return selection.scope === scope
    ? selection
    : { scope, entryIds: new Set<MediaListEntryId>() }
}

export function selectEntryIds(
  selection: ScopedSelection,
  entryIds: Iterable<MediaListEntryId>,
): ScopedSelection {
  return {
    ...selection,
    entryIds: new Set([...selection.entryIds, ...entryIds]),
  }
}

export function toggleSelectedEntry(
  selection: ScopedSelection,
  entryId: MediaListEntryId,
): ScopedSelection {
  const entryIds = new Set(selection.entryIds)
  if (entryIds.has(entryId)) entryIds.delete(entryId)
  else entryIds.add(entryId)
  return { ...selection, entryIds }
}

export function clearSelection(selection: ScopedSelection): ScopedSelection {
  return { ...selection, entryIds: new Set<MediaListEntryId>() }
}
