import { describe, expect, it, vi } from 'vitest'

import {
  createDefaultListQuery,
  createListQueryFingerprint,
  createMediaListWorkspace,
  filterAndSortEntryIds,
  projectList,
  type CollectionKey,
  type CreatedMediaListEntry,
  type ListQuery,
  type MediaListEntry,
} from '..'
import {
  MediaFormat,
  MediaListStatus,
  MediaType as AniListMediaType,
} from '@/types/anilist'

const animeKey: CollectionKey = { accountId: 7, mediaType: 'ANIME' }

function entry(
  id: number,
  overrides: Partial<MediaListEntry> = {},
): MediaListEntry {
  return {
    id,
    userId: animeKey.accountId,
    mediaId: id * 10,
    status: MediaListStatus.CURRENT,
    score: 5,
    progress: 2,
    startedAt: { year: 2020, month: 1, day: 2 },
    updatedAt: 100,
    media: {
      id: id * 10,
      type: AniListMediaType.ANIME,
      format: MediaFormat.TV,
      title: { userPreferred: `Entry ${id}` },
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

describe('workspace terminal-state coverage', () => {
  it('rejects a created entry whose media type does not match the collection', () => {
    const workspace = createMediaListWorkspace()
    workspace.replaceCollection(animeKey, [entry(1)], 100)
    const before = workspace.getCollection(animeKey)

    expect(() =>
      workspace.commitCreated(animeKey, [
        entry(2, {
          media: {
            id: 20,
            type: AniListMediaType.MANGA,
            title: { userPreferred: 'Manga entry' },
          },
        }) as CreatedMediaListEntry,
      ]),
    ).toThrow(/media type/i)
    expect(workspace.getCollection(animeKey)).toBe(before)
  })

  it('treats empty and not-yet-loaded created-entry commits as no-ops', () => {
    const workspace = createMediaListWorkspace()
    const listener = vi.fn()
    workspace.subscribe(listener)

    workspace.commitCreated(animeKey, [])
    workspace.commitCreated(animeKey, [entry(1) as CreatedMediaListEntry])

    expect(workspace.getCollection(animeKey)).toMatchObject({
      entries: [],
      loadState: { status: 'idle' },
      revision: 0,
    })
    expect(listener).not.toHaveBeenCalled()
  })

  it('deduplicates created entries without manufacturing absent cover or custom-list data', () => {
    const workspace = createMediaListWorkspace()
    workspace.replaceCollection(animeKey, [entry(1, { customLists: undefined })], 100)

    workspace.commitCreated(animeKey, [
      entry(1, {
        score: 9,
        customLists: undefined,
        media: {
          id: 10,
          type: AniListMediaType.ANIME,
          title: { english: 'Canonical title' },
        },
      }) as CreatedMediaListEntry,
    ])

    expect(workspace.getCollection(animeKey).entries).toEqual([
      expect.objectContaining({
        id: 1,
        score: 9,
        customLists: undefined,
        media: expect.objectContaining({
          title: {
            userPreferred: 'Entry 1',
            english: 'Canonical title',
          },
          coverImage: undefined,
        }),
      }),
    ])
  })

  it('keeps an initial load error visible when a confirmed creation arrives', () => {
    const workspace = createMediaListWorkspace()
    const load = workspace.beginLoad(animeKey)
    workspace.rejectLoad(load, {
      kind: 'error',
      message: 'Service unavailable',
      retryable: true,
    })

    workspace.commitCreated(animeKey, [entry(1) as CreatedMediaListEntry])

    expect(workspace.getCollection(animeKey)).toMatchObject({
      entries: [{ id: 1 }],
      loadState: {
        status: 'error',
        message: 'Service unavailable',
        retryable: true,
      },
    })
  })

  it('leaves untouched entries referentially stable during a sparse commit', () => {
    const workspace = createMediaListWorkspace()
    workspace.replaceCollection(animeKey, [entry(1), entry(2)], 100)
    const untouched = workspace.getCollection(animeKey).entries[1]

    workspace.commitConfirmed(
      animeKey,
      [{ entryId: 1, mediaType: 'ANIME', values: { score: 10 } }],
      [],
    )

    expect(workspace.getCollection(animeKey).entries[1]).toBe(untouched)
  })

  it('ignores a confirmed patch before its collection has been loaded', () => {
    const workspace = createMediaListWorkspace()
    const listener = vi.fn()
    workspace.subscribe(listener)

    workspace.commitConfirmed(
      animeKey,
      [{ entryId: 1, mediaType: 'ANIME', values: { progress: 3 } }],
      [],
    )

    expect(workspace.getCollection(animeKey).revision).toBe(0)
    expect(listener).not.toHaveBeenCalled()
  })

  it('invalidates every terminal operation after the account is cleared', () => {
    const workspace = createMediaListWorkspace()
    const request = workspace.beginLoad(animeKey)
    workspace.clearAccount(animeKey.accountId)

    expect(workspace.resolveLoad(request, [entry(1)], 100)).toBe(false)
    expect(workspace.rejectLoad(request, { kind: 'offline' })).toBe(false)
    expect(workspace.cancelLoad(request)).toBe(false)
    expect(workspace.getCollection(animeKey).loadState).toEqual({ status: 'idle' })
  })

  it('reports a non-retryable error before an initial collection succeeds', () => {
    const workspace = createMediaListWorkspace()
    const request = workspace.beginLoad(animeKey)

    expect(
      workspace.rejectLoad(request, {
        kind: 'error',
        message: 'Invalid response',
        retryable: false,
      }),
    ).toBe(true)
    expect(workspace.getCollection(animeKey).loadState).toEqual({
      status: 'error',
      message: 'Invalid response',
      retryable: false,
    })
    expect(workspace.cancelLoad(request)).toBe(false)
  })
})

describe('query edge coverage', () => {
  it('rejects entries independently below the year minimum and above the score maximum', () => {
    const tooOld = entry(1, {
      media: { ...entry(1).media!, seasonYear: 2019 },
    })
    const tooHighlyScored = entry(2, { score: 9 })

    expect(projectList([tooOld], query({ year: { min: 2020 } })).totalEntries).toBe(0)
    expect(
      projectList([tooHighlyScored], query({ score: { max: 8 } })).totalEntries,
    ).toBe(0)
  })

  it('handles absent media while evaluating genre and title filters', () => {
    const withoutMedia = entry(1, { media: undefined })

    expect(
      projectList([withoutMedia], query({ genres: ['Drama'] })).totalEntries,
    ).toBe(0)
    expect(
      projectList([withoutMedia], query({ search: 'missing' })).totalEntries,
    ).toBe(0)
  })

  it('sorts when the right-hand numeric and date operands are absent', () => {
    const missing = entry(1, {
      score: undefined,
      progress: undefined,
      startedAt: undefined,
      updatedAt: undefined,
    })
    const populated = entry(2, {
      score: 1,
      progress: 1,
      startedAt: { year: 1, month: 1, day: 1 },
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
          [missing, populated],
          query({ sort: { field, direction: 'asc' } }),
        ),
      ).toEqual([1, 2])
    }
  })

  it('normalizes an omitted hidden-entry preference to the default scope', () => {
    const explicit = query({ includeHidden: false })
    const omitted = query({ includeHidden: undefined })

    expect(createListQueryFingerprint(omitted)).toBe(
      createListQueryFingerprint(explicit),
    )
  })
})
