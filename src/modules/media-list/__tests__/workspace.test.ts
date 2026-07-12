import { describe, expect, it, vi } from 'vitest'

import {
  createMediaListWorkspace,
  type CollectionKey,
  type CreatedMediaListEntry,
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
    userId: 7,
    mediaId: id * 10,
    status: MediaListStatus.CURRENT,
    score: 5,
    progress: 2,
    media: {
      id: id * 10,
      type: AniListMediaType.ANIME,
      format: MediaFormat.TV,
      title: { userPreferred: `Title ${id}` },
      coverImage: { large: `https://img.test/${id}.jpg` },
      genres: ['Drama'],
    },
    ...overrides,
  }
}

describe('media-list workspace', () => {
  it('deduplicates every replacement by list-entry ID and preserves rich fields', () => {
    const workspace = createMediaListWorkspace()
    const rich = entry(1, { customLists: { Favorites: true } })
    const repeated = {
      ...entry(1),
      score: 8,
      media: {
        id: 10,
        type: AniListMediaType.ANIME,
        title: { userPreferred: 'Updated title' },
      },
    }

    workspace.replaceCollection(animeKey, [rich, repeated, entry(2)], 100)

    const snapshot = workspace.getCollection(animeKey)
    expect(snapshot.entries).toHaveLength(2)
    expect(snapshot.entries[0]).toMatchObject({
      id: 1,
      score: 8,
      customLists: { Favorites: true },
      media: {
        title: { userPreferred: 'Updated title' },
        coverImage: { large: 'https://img.test/1.jpg' },
        genres: ['Drama'],
      },
    })
    expect(snapshot.loadState).toEqual({ status: 'ready', loadedAt: 100 })
  })

  it('treats a loaded empty collection as fresh rather than idle or erroneous', () => {
    const workspace = createMediaListWorkspace()

    workspace.replaceCollection(animeKey, [], 123)

    expect(workspace.getCollection(animeKey)).toMatchObject({
      entries: [],
      loadState: { status: 'empty', loadedAt: 123 },
    })
  })

  it('commits a whole sparse outcome once while preserving immutable media', () => {
    const workspace = createMediaListWorkspace()
    workspace.replaceCollection(animeKey, [entry(1), entry(2), entry(3)], 100)
    const originalMedia = workspace.getCollection(animeKey).entries[0]?.media
    const listener = vi.fn()
    workspace.subscribe(listener)

    workspace.commitConfirmed(
      animeKey,
      [
        {
          entryId: 1,
          mediaType: 'ANIME',
          values: {
            score: 0,
            progress: 0,
            notes: '',
            status: MediaListStatus.COMPLETED,
          },
          updatedAt: 999,
        },
        {
          entryId: 2,
          mediaType: 'ANIME',
          values: { hiddenFromStatusLists: true },
        },
      ],
      [3],
    )

    const snapshot = workspace.getCollection(animeKey)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(snapshot.entries.map(({ id }) => id)).toEqual([1, 2])
    expect(snapshot.entries[0]).toMatchObject({
      score: 0,
      progress: 0,
      notes: '',
      status: MediaListStatus.COMPLETED,
      updatedAt: 999,
    })
    expect(snapshot.entries[0]?.media).toBe(originalMedia)
  })

  it('atomically commits locally constructed created entries and invalidates an older refresh', () => {
    const workspace = createMediaListWorkspace()
    workspace.replaceCollection(animeKey, [entry(1)], 100)
    const refresh = workspace.beginLoad(animeKey)
    const listener = vi.fn()
    workspace.subscribe(listener)

    workspace.commitCreated(animeKey, [
      entry(11, {
        mediaId: 101,
        status: MediaListStatus.COMPLETED,
        progress: 12,
        media: {
          id: 101,
          type: AniListMediaType.ANIME,
          format: MediaFormat.TV,
          title: { userPreferred: 'Related season' },
          episodes: 12,
        },
      }) as CreatedMediaListEntry,
    ])

    expect(listener).toHaveBeenCalledTimes(1)
    expect(workspace.getCollection(animeKey).entries.map(({ id }) => id)).toEqual([
      1,
      11,
    ])
    expect(workspace.getCollection(animeKey).loadState).toEqual({
      status: 'ready',
      loadedAt: 100,
    })
    expect(workspace.resolveLoad(refresh, [entry(1)], 200)).toBe(false)
  })

  it('reconciles created, updated, and deleted results in one emission', () => {
    const workspace = createMediaListWorkspace()
    workspace.replaceCollection(animeKey, [entry(1), entry(2)], 100)
    const listener = vi.fn()
    workspace.subscribe(listener)

    workspace.commitJobOutcome(
      animeKey,
      [
        {
          entryId: 1,
          mediaType: 'ANIME',
          values: { status: MediaListStatus.COMPLETED },
        },
      ],
      [2],
      [
        entry(11, {
          mediaId: 101,
          media: {
            id: 101,
            type: AniListMediaType.ANIME,
            title: { userPreferred: 'Created in the same job' },
          },
        }) as CreatedMediaListEntry,
      ],
    )

    expect(listener).toHaveBeenCalledTimes(1)
    expect(workspace.getCollection(animeKey).entries).toMatchObject([
      { id: 1, status: MediaListStatus.COMPLETED },
      { id: 11, mediaId: 101 },
    ])
  })

  it('rejects created entries for another account or media type atomically', () => {
    const workspace = createMediaListWorkspace()
    workspace.replaceCollection(animeKey, [entry(1)], 100)
    const before = workspace.getCollection(animeKey)

    expect(() =>
      workspace.commitCreated(animeKey, [
        entry(11, {
          userId: 8,
          media: {
            id: 110,
            type: AniListMediaType.MANGA,
            title: { userPreferred: 'Wrong account and type' },
          },
        }) as CreatedMediaListEntry,
      ]),
    ).toThrow(/account|media type/i)
    expect(workspace.getCollection(animeKey)).toBe(before)
  })

  it('uses the collection key media type and rejects mismatched patches atomically', () => {
    const workspace = createMediaListWorkspace()
    workspace.replaceCollection(animeKey, [entry(1), entry(2)], 100)
    const before = workspace.getCollection(animeKey)

    expect(() =>
      workspace.commitConfirmed(
        animeKey,
        [
          {
            entryId: 1,
            mediaType: 'ANIME',
            values: { score: 10 },
          },
          {
            entryId: 2,
            mediaType: 'MANGA',
            values: { score: 10 },
          },
        ],
        [],
      ),
    ).toThrow(/media type/i)

    expect(workspace.getCollection(animeKey)).toBe(before)
  })

  it('keeps cards available during refresh and discards responses older than a mutation', () => {
    const workspace = createMediaListWorkspace()
    workspace.replaceCollection(animeKey, [entry(1)], 100)

    const request = workspace.beginLoad(animeKey)
    expect(workspace.getCollection(animeKey)).toMatchObject({
      entries: [{ id: 1 }],
      loadState: { status: 'refreshing', loadedAt: 100 },
    })

    workspace.commitConfirmed(
      animeKey,
      [
        {
          entryId: 1,
          mediaType: 'ANIME',
          values: { score: 10 },
        },
      ],
      [],
    )

    expect(workspace.resolveLoad(request, [entry(1, { score: 5 })], 200)).toBe(
      false,
    )
    expect(workspace.getCollection(animeKey).entries[0]?.score).toBe(10)
    expect(workspace.getCollection(animeKey).loadState.status).toBe('ready')
  })

  it('lets only the newest overlapping request replace a collection', () => {
    const workspace = createMediaListWorkspace()
    const first = workspace.beginLoad(animeKey)
    const second = workspace.beginLoad(animeKey)

    expect(workspace.resolveLoad(first, [entry(1)], 100)).toBe(false)
    expect(workspace.resolveLoad(second, [entry(2)], 200)).toBe(true)
    expect(workspace.getCollection(animeKey).entries.map(({ id }) => id)).toEqual([
      2,
    ])
  })

  it('isolates collections by account and media type and clears one account at once', () => {
    const workspace = createMediaListWorkspace()
    const mangaKey: CollectionKey = { accountId: 7, mediaType: 'MANGA' }
    const otherAccount: CollectionKey = { accountId: 8, mediaType: 'ANIME' }
    workspace.replaceCollection(animeKey, [entry(1)], 100)
    workspace.replaceCollection(mangaKey, [entry(2)], 100)
    workspace.replaceCollection(otherAccount, [entry(3)], 100)
    const listener = vi.fn()
    workspace.subscribe(listener)

    workspace.clearAccount(7)

    expect(listener).toHaveBeenCalledTimes(1)
    expect(workspace.getCollection(animeKey).loadState.status).toBe('idle')
    expect(workspace.getCollection(mangaKey).loadState.status).toBe('idle')
    expect(workspace.getCollection(otherAccount).entries).toHaveLength(1)
  })

  it('surfaces distinct offline and retryable error states without discarding entries', () => {
    const workspace = createMediaListWorkspace()
    workspace.replaceCollection(animeKey, [entry(1)], 100)
    const offlineRequest = workspace.beginLoad(animeKey)

    expect(workspace.rejectLoad(offlineRequest, { kind: 'offline' })).toBe(true)
    expect(workspace.getCollection(animeKey)).toMatchObject({
      entries: [{ id: 1 }],
      loadState: { status: 'offline', loadedAt: 100 },
    })

    const failedRequest = workspace.beginLoad(animeKey)
    expect(
      workspace.rejectLoad(failedRequest, {
        kind: 'error',
        message: 'AniList is unavailable',
        retryable: true,
      }),
    ).toBe(true)
    expect(workspace.getCollection(animeKey).loadState).toEqual({
      status: 'error',
      message: 'AniList is unavailable',
      retryable: true,
    })
  })

  it('unions custom-list memberships when duplicate collection groups disagree', () => {
    const workspace = createMediaListWorkspace()
    workspace.replaceCollection(
      animeKey,
      [
        entry(1, { customLists: { Favorites: true, Archived: false } }),
        entry(1, { customLists: { Favorites: false, Archived: true } }),
      ],
      100,
    )

    expect(workspace.getCollection(animeKey).entries[0]?.customLists).toEqual({
      Favorites: true,
      Archived: true,
    })
  })

  it('handles sparse duplicate entries with and without media', () => {
    const workspace = createMediaListWorkspace()
    const withoutMedia = entry(1, { media: undefined, score: 1 })
    const rich = entry(1, { score: 2 })
    const sparseLast = entry(1, { media: undefined, score: 3 })

    workspace.replaceCollection(animeKey, [withoutMedia, rich, sparseLast], 100)

    expect(workspace.getCollection(animeKey).entries[0]).toMatchObject({
      score: 3,
      media: { title: { userPreferred: 'Title 1' } },
    })
  })

  it('allows no-op commits and unknown account clears without notifying', () => {
    const workspace = createMediaListWorkspace()
    workspace.replaceCollection(animeKey, [entry(1)], 100)
    const listener = vi.fn()
    workspace.subscribe(listener)

    workspace.commitConfirmed(animeKey, [], [])
    workspace.clearAccount(999)

    expect(listener).not.toHaveBeenCalled()
  })

  it('applies repeated patches in order and transitions to empty after deletion', () => {
    const workspace = createMediaListWorkspace()
    workspace.replaceCollection(animeKey, [entry(1)], 100)

    workspace.commitConfirmed(
      animeKey,
      [
        { entryId: 1, mediaType: 'ANIME', values: { score: 8 } },
        { entryId: 1, mediaType: 'ANIME', values: { score: 9 } },
      ],
      [],
    )
    expect(workspace.getCollection(animeKey).entries[0]?.score).toBe(9)

    workspace.commitConfirmed(animeKey, [], [1])
    expect(workspace.getCollection(animeKey).loadState).toEqual({
      status: 'empty',
      loadedAt: 100,
    })
  })

  it('can cancel initial and background loads and rejects stale terminal calls', () => {
    const workspace = createMediaListWorkspace()
    const initial = workspace.beginLoad(animeKey)

    expect(workspace.cancelLoad(initial)).toBe(true)
    expect(workspace.getCollection(animeKey).loadState).toEqual({ status: 'idle' })
    expect(workspace.cancelLoad(initial)).toBe(false)
    expect(workspace.rejectLoad(initial, { kind: 'offline' })).toBe(false)

    workspace.replaceCollection(animeKey, [entry(1)], 100)
    const refresh = workspace.beginLoad(animeKey)
    expect(workspace.cancelLoad(refresh)).toBe(true)
    expect(workspace.getCollection(animeKey).loadState).toEqual({
      status: 'ready',
      loadedAt: 100,
    })
  })

  it('resolves an initial empty load and reports offline before any collection exists', () => {
    const workspace = createMediaListWorkspace()
    const initial = workspace.beginLoad(animeKey)
    expect(workspace.resolveLoad(initial, [], 100)).toBe(true)
    expect(workspace.getCollection(animeKey).loadState.status).toBe('empty')

    workspace.clearAccount(animeKey.accountId)
    const offline = workspace.beginLoad(animeKey)
    expect(workspace.rejectLoad(offline, { kind: 'offline' })).toBe(true)
    expect(workspace.getCollection(animeKey).loadState).toEqual({
      status: 'offline',
    })
  })

  it('supports unsubscribing listeners', () => {
    const workspace = createMediaListWorkspace()
    const listener = vi.fn()
    const unsubscribe = workspace.subscribe(listener)
    unsubscribe()

    workspace.replaceCollection(animeKey, [entry(1)], 100)

    expect(listener).not.toHaveBeenCalled()
  })
})
