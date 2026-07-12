import { describe, expect, it } from 'vitest'

import {
  clearSelection,
  createDefaultListQuery,
  createListQueryFingerprint,
  createScopedSelection,
  createSelectionScope,
  filterAndSortEntryIds,
  projectList,
  reconcileSelectionScope,
  selectEntryIds,
  toggleSelectedEntry,
  type CollectionKey,
  type ListQuery,
  type MediaListEntry,
} from '..'
import {
  MediaFormat,
  MediaListStatus,
  MediaType as AniListMediaType,
} from '@/types/anilist'

function entry(
  id: number,
  overrides: Partial<MediaListEntry> = {},
): MediaListEntry {
  return {
    id,
    userId: 7,
    mediaId: id * 10,
    status: MediaListStatus.CURRENT,
    score: 5,
    progress: 2,
    startedAt: { year: 2020, month: 1, day: 2 },
    updatedAt: 100,
    customLists: {},
    media: {
      id: id * 10,
      type: AniListMediaType.ANIME,
      format: MediaFormat.TV,
      title: { userPreferred: `Title ${id}` },
      genres: ['Drama'],
      countryOfOrigin: 'JP',
      seasonYear: 2020,
    },
    ...overrides,
  }
}

function query(overrides: Partial<ListQuery> = {}): ListQuery {
  return { ...createDefaultListQuery(), ...overrides }
}

describe('list projection', () => {
  it('keeps statuses and custom-list names as separate filter dimensions', () => {
    const entries = [
      entry(1, {
        status: MediaListStatus.CURRENT,
        customLists: { Favorites: true },
      }),
      entry(2, {
        status: MediaListStatus.CURRENT,
        customLists: { Someday: true },
      }),
      entry(3, {
        status: MediaListStatus.COMPLETED,
        customLists: { Favorites: true },
      }),
    ]

    const projection = projectList(
      entries,
      query({
        statuses: [MediaListStatus.CURRENT],
        customLists: ['Favorites'],
      }),
    )

    expect(projection.entries.map(({ id }) => id)).toEqual([1])
  })

  it('filters all supported dimensions before paginating', () => {
    const matching = entry(1, {
      score: 8,
      media: {
        id: 10,
        type: AniListMediaType.ANIME,
        format: MediaFormat.MOVIE,
        title: { english: 'Blue Orbit' },
        genres: ['Drama', 'Sci-Fi'],
        countryOfOrigin: 'JP',
        seasonYear: 2022,
      },
    })
    const projection = projectList(
      [matching, entry(2)],
      query({
        formats: [MediaFormat.MOVIE],
        genres: ['Sci-Fi'],
        countries: ['JP'],
        year: { min: 2021, max: 2023 },
        score: { min: 7, max: 9 },
        search: ' orbit ',
      }),
    )

    expect(projection.entries).toEqual([matching])
  })

  it('sorts a copied ID list with entry ID as a deterministic final tie-breaker', () => {
    const canonical = [
      entry(20, { media: { ...entry(20).media!, title: { userPreferred: 'Same' } } }),
      entry(3, { media: { ...entry(3).media!, title: { userPreferred: 'Same' } } }),
      entry(11, { media: { ...entry(11).media!, title: { userPreferred: 'Same' } } }),
    ]
    const originalOrder = canonical.map(({ id }) => id)

    const projection = projectList(canonical, query())

    expect(projection.entries.map(({ id }) => id)).toEqual([3, 11, 20])
    expect(canonical.map(({ id }) => id)).toEqual(originalOrder)
  })

  it('sorts zero values correctly in either direction', () => {
    const entries = [entry(1, { score: 5 }), entry(2, { score: 0 })]

    expect(
      projectList(
        entries,
        query({ sort: { field: 'score', direction: 'asc' } }),
      ).entries.map(({ id }) => id),
    ).toEqual([2, 1])
    expect(
      projectList(
        entries,
        query({ sort: { field: 'score', direction: 'desc' } }),
      ).entries.map(({ id }) => id),
    ).toEqual([1, 2])
  })

  it('clamps pages and backfills the current page after deletion', () => {
    const entries = Array.from({ length: 120 }, (_, index) => entry(index + 1))
    const onSecondPage = query({
      page: 2,
      pageSize: 100,
      sort: { field: 'updatedAt', direction: 'asc' },
    })

    const initial = projectList(entries, onSecondPage)
    const afterDeletion = projectList(entries.slice(0, 99), onSecondPage)

    expect(initial.entries).toHaveLength(20)
    expect(initial.page).toBe(2)
    expect(afterDeletion.entries).toHaveLength(99)
    expect(afterDeletion.page).toBe(1)
    expect(afterDeletion.pageCount).toBe(1)
  })

  it('keeps hidden entries out unless the query explicitly includes them', () => {
    const entries = [entry(1), entry(2, { hiddenFromStatusLists: true })]

    expect(projectList(entries, query()).entries.map(({ id }) => id)).toEqual([1])
    expect(
      projectList(entries, query({ includeHidden: true })).entries.map(
        ({ id }) => id,
      ),
    ).toEqual([1, 2])
  })

  it('applies each numeric and date sort field without mutating input', () => {
    const entries = [
      entry(1, {
        progress: 3,
        startedAt: { year: 2023, month: 2, day: 1 },
        updatedAt: 300,
      }),
      entry(2, {
        progress: 1,
        startedAt: { year: 2020, month: 12, day: 31 },
        updatedAt: 100,
      }),
    ]

    expect(
      filterAndSortEntryIds(
        entries,
        query({ sort: { field: 'progress', direction: 'asc' } }),
      ),
    ).toEqual([2, 1])
    expect(
      filterAndSortEntryIds(
        entries,
        query({ sort: { field: 'startedAt', direction: 'desc' } }),
      ),
    ).toEqual([1, 2])
    expect(
      filterAndSortEntryIds(
        entries,
        query({ sort: { field: 'updatedAt', direction: 'asc' } }),
      ),
    ).toEqual([2, 1])
  })

  it('excludes entries that cannot satisfy an active range or categorical filter', () => {
    const missing = entry(1, {
      status: undefined,
      score: undefined,
      media: {
        id: 10,
        type: AniListMediaType.ANIME,
        title: {},
      },
    })
    const base = createDefaultListQuery()

    expect(
      projectList([missing], {
        ...base,
        statuses: [MediaListStatus.CURRENT],
      }).totalEntries,
    ).toBe(0)
    expect(
      projectList([missing], { ...base, customLists: ['Missing'] }).totalEntries,
    ).toBe(0)
    expect(
      projectList([missing], { ...base, formats: [MediaFormat.TV] }).totalEntries,
    ).toBe(0)
    expect(
      projectList([missing], { ...base, genres: ['Drama'] }).totalEntries,
    ).toBe(0)
    expect(
      projectList([missing], { ...base, countries: ['JP'] }).totalEntries,
    ).toBe(0)
    expect(
      projectList([missing], { ...base, year: { min: 2000 } }).totalEntries,
    ).toBe(0)
    expect(
      projectList([missing], { ...base, score: { min: 1 } }).totalEntries,
    ).toBe(0)
    expect(
      projectList([missing], { ...base, search: 'unknown' }).totalEntries,
    ).toBe(0)
  })

  it('handles upper bounds and invalid requested pages', () => {
    const entries = [entry(1, { score: 9 }), entry(2, { score: 2 })]
    const bounded = projectList(
      entries,
      query({
        year: { max: 2019 },
        score: { max: 3 },
        page: Number.NaN,
      }),
    )
    const negativePage = projectList(entries, query({ page: -5 }))

    expect(bounded.totalEntries).toBe(0)
    expect(bounded.page).toBe(1)
    expect(negativePage.page).toBe(1)
  })

  it('uses every title fallback for search and deterministic title sorting', () => {
    const entries = [
      entry(1, {
        media: {
          id: 10,
          type: AniListMediaType.ANIME,
          title: { userPreferred: 'Delta' },
        },
      }),
      entry(2, {
        media: {
          id: 20,
          type: AniListMediaType.ANIME,
          title: { romaji: 'Charlie' },
        },
      }),
      entry(3, {
        media: {
          id: 30,
          type: AniListMediaType.ANIME,
          title: { english: 'Bravo' },
        },
      }),
      entry(4, {
        media: {
          id: 40,
          type: AniListMediaType.ANIME,
          title: { native: 'Alpha' },
        },
      }),
      entry(5, { media: undefined }),
    ]

    expect(projectList(entries, query()).entries.map(({ id }) => id)).toEqual([
      5, 4, 3, 2, 1,
    ])
    expect(
      projectList(entries, query({ search: 'charlie' })).entries[0]?.id,
    ).toBe(2)
    expect(projectList(entries, query({ search: 'bravo' })).entries[0]?.id).toBe(
      3,
    )
    expect(projectList(entries, query({ search: 'alpha' })).entries[0]?.id).toBe(
      4,
    )
  })

  it('keeps entries exactly on both year and score boundaries', () => {
    const boundary = entry(1, {
      score: 7,
      media: {
        ...entry(1).media!,
        startDate: { year: 2020 },
        seasonYear: 1999,
      },
    })
    const projection = projectList(
      [boundary],
      query({ year: { min: 2020, max: 2020 }, score: { min: 7, max: 7 } }),
    )

    expect(projection.entries).toEqual([boundary])
  })

  it('sorts missing numeric and fuzzy-date values as zero', () => {
    const missing = entry(1, {
      score: undefined,
      progress: undefined,
      startedAt: undefined,
      updatedAt: undefined,
    })
    const dated = entry(2, {
      score: 1,
      progress: 1,
      startedAt: { year: 1 },
      updatedAt: 1,
    })

    for (const field of [
      'score',
      'progress',
      'startedAt',
      'updatedAt',
    ] as const) {
      expect(
        filterAndSortEntryIds(
          [dated, missing],
          query({ sort: { field, direction: 'asc' } }),
        ),
      ).toEqual([1, 2])
    }
  })
})

describe('selection query scope', () => {
  const key: CollectionKey = { accountId: 7, mediaType: 'ANIME' }

  it('ignores page navigation but changes for filters, account, media, or page size', () => {
    const first = query({ page: 1 })
    const anotherPage = query({ page: 2 })

    expect(createListQueryFingerprint(first)).toBe(
      createListQueryFingerprint(anotherPage),
    )
    expect(createSelectionScope(key, first)).toBe(
      createSelectionScope(key, anotherPage),
    )
    expect(createSelectionScope(key, first)).not.toBe(
      createSelectionScope(key, query({ search: 'different' })),
    )
    expect(createSelectionScope(key, first)).not.toBe(
      createSelectionScope({ accountId: 8, mediaType: 'ANIME' }, first),
    )
    expect(createSelectionScope(key, first)).not.toBe(
      createSelectionScope({ accountId: 7, mediaType: 'MANGA' }, first),
    )
    expect(createSelectionScope(key, first)).not.toBe(
      createSelectionScope(key, query({ pageSize: 50 })),
    )
  })

  it('retains selected IDs only while the selection scope is unchanged', () => {
    const selected = {
      scope: createSelectionScope(key, query()),
      entryIds: new Set([1, 2]) as ReadonlySet<number>,
    }

    expect(reconcileSelectionScope(selected, key, query())).toBe(selected)
    expect(
      reconcileSelectionScope(selected, key, query({ statuses: [MediaListStatus.COMPLETED] })),
    ).toMatchObject({ entryIds: new Set() })
  })

  it('creates, extends, toggles, and clears immutable scoped selections', () => {
    const empty = createScopedSelection(key, query())
    const selected = selectEntryIds(empty, [1, 2, 2])
    const toggledOff = toggleSelectedEntry(selected, 1)
    const toggledOn = toggleSelectedEntry(toggledOff, 3)
    const cleared = clearSelection(toggledOn)

    expect([...empty.entryIds]).toEqual([])
    expect([...selected.entryIds]).toEqual([1, 2])
    expect([...toggledOff.entryIds]).toEqual([2])
    expect([...toggledOn.entryIds]).toEqual([2, 3])
    expect([...cleared.entryIds]).toEqual([])
  })

  it('canonicalizes filter ordering, duplicates, bounds, and search casing', () => {
    const left = query({
      statuses: [MediaListStatus.PLANNING, MediaListStatus.CURRENT],
      customLists: ['B', 'A', 'A'],
      year: { max: 2024, min: 2000 },
      score: { max: 10 },
      search: '  BLUE ',
    })
    const right = query({
      statuses: [MediaListStatus.CURRENT, MediaListStatus.PLANNING],
      customLists: ['A', 'B'],
      year: { min: 2000, max: 2024 },
      score: { min: undefined, max: 10 },
      search: 'blue',
    })

    expect(createListQueryFingerprint(left)).toBe(
      createListQueryFingerprint(right),
    )
  })
})
