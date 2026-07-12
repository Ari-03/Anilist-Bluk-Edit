import { describe, expect, it } from 'vitest'

import {
  AniListBrowserGateway,
  DeterministicAniListGateway,
  AniListGatewayError,
  AniListTransportError,
  type GraphQLRequest,
  type GraphQLResult,
  type GraphQLTransport,
} from '..'

class ReadTransport implements GraphQLTransport {
  readonly requests: GraphQLRequest[] = []
  readonly responses: Array<GraphQLResult<unknown> | Error> = []

  async execute<T>(request: GraphQLRequest): Promise<GraphQLResult<T>> {
    this.requests.push(request)
    const response = this.responses.shift()
    if (!response) throw new Error('Missing read response')
    if (response instanceof Error) throw response
    return response as GraphQLResult<T>
  }
}

const response = <T>(data: T, errors: GraphQLResult<T>['errors'] = []): GraphQLResult<T> => ({
  data,
  errors,
  status: 200,
  rateLimit: {},
})

const media = (
  id: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id,
  title: { userPreferred: `Season ${id}` },
  type: 'ANIME',
  format: 'TV',
  startDate: { year: 2020 + id, month: 1, day: 1 },
  seasonYear: 2020 + id,
  episodes: 12,
  chapters: null,
  mediaListEntry: null,
  relations: { edges: [] },
  ...overrides,
})

describe('AniList read-side gateway', () => {
  it('loads a trimmed, flattened collection and preserves an empty result', async () => {
    const transport = new ReadTransport()
    const entry = {
      id: 11,
      mediaId: 101,
      status: 'CURRENT',
      score: 8,
      progress: 3,
      private: false,
      hiddenFromStatusLists: false,
      notes: 'note',
      customLists: { Seasonal: true },
      startedAt: { year: 2024, month: 1, day: 2 },
      updatedAt: 123,
      media: {
        id: 101,
        title: { userPreferred: 'Title', romaji: 'Romaji' },
        type: 'ANIME',
        format: 'TV',
        startDate: { year: 2024, month: 1, day: 1 },
        seasonYear: 2024,
        episodes: 12,
        chapters: null,
        countryOfOrigin: 'JP',
        genres: ['Drama'],
        coverImage: { large: 'large.jpg', medium: 'medium.jpg', color: '#fff' },
        description: 'must not survive normalization',
      },
    }
    transport.responses.push(
      response({
        MediaListCollection: {
          lists: [{ entries: [entry] }],
        },
      }),
      response({ MediaListCollection: { lists: [] } }),
    )
    const gateway = new AniListBrowserGateway(transport)

    const loaded = await gateway.loadMediaListCollection({
      accountId: 7,
      mediaType: 'ANIME',
    })
    const empty = await gateway.loadMediaListCollection({
      accountId: 7,
      mediaType: 'MANGA',
    })

    expect(loaded).toHaveLength(1)
    expect(loaded[0]).toMatchObject({ id: 11, userId: 7, mediaId: 101 })
    expect(loaded[0]?.media).not.toHaveProperty('description')
    expect(empty).toEqual([])
    expect(transport.requests[0]).toMatchObject({
      kind: 'read',
      variables: { userId: 7, type: 'ANIME' },
    })
    expect(transport.requests[0]?.query).not.toMatch(
      /description|popularity|bannerImage|tags|nextAiringEpisode|completedAt|createdAt|siteUrl/,
    )
  })

  it('preserves duplicate collection-section variants for workspace reconciliation', async () => {
    const transport = new ReadTransport()
    const shared = {
      id: 11,
      mediaId: 101,
      score: 8,
      progress: 3,
      media: {
        id: 101,
        title: { userPreferred: 'Title' },
        type: 'ANIME',
        genres: ['Drama'],
      },
    }
    transport.responses.push(
      response({
        MediaListCollection: {
          lists: [
            {
              entries: [
                {
                  ...shared,
                  status: 'CURRENT',
                  customLists: { Seasonal: true, Favorites: false },
                },
              ],
            },
            {
              entries: [
                {
                  ...shared,
                  status: 'PLANNING',
                  customLists: { Seasonal: false, Favorites: true },
                },
              ],
            },
          ],
        },
      }),
    )

    const loaded = await new AniListBrowserGateway(
      transport,
    ).loadMediaListCollection({ accountId: 7, mediaType: 'ANIME' })

    expect(
      loaded.map(({ id, status, customLists }) => ({ id, status, customLists })),
    ).toEqual([
      {
        id: 11,
        status: 'CURRENT',
        customLists: { Seasonal: true, Favorites: false },
      },
      {
        id: 11,
        status: 'PLANNING',
        customLists: { Seasonal: false, Favorites: true },
      },
    ])
  })

  it('loads separate anime and manga custom-list catalogs', async () => {
    const transport = new ReadTransport()
    transport.responses.push(
      response({
        Viewer: {
          mediaListOptions: {
            animeList: { customLists: ['Seasonal', 'Seasonal', 'Favorites'] },
            mangaList: { customLists: ['Owned'] },
          },
        },
      }),
    )
    const catalog = await new AniListBrowserGateway(
      transport,
    ).getMediaListOptionsCatalog({ accountId: 7 })

    expect(catalog).toEqual({
      animeCustomLists: ['Seasonal', 'Favorites'],
      mangaCustomLists: ['Owned'],
    })
    expect(transport.requests[0]?.query).toContain('Viewer')
  })

  it('normalizes sparse collection/catalog responses without inventing fields', async () => {
    const transport = new ReadTransport()
    transport.responses.push(
      response({
        MediaListCollection: {
          lists: [
            {
              entries: [
                null,
                { id: 1, mediaId: 101, media: { id: 101, title: null, type: null } },
              ],
            },
            {},
          ],
        },
      }),
      response({
        Viewer: {
          mediaListOptions: {
            animeList: { customLists: null },
            mangaList: {},
          },
        },
      }),
      response({ Page: {} }),
    )
    const gateway = new AniListBrowserGateway(transport)

    const collection = await gateway.loadMediaListCollection({
      accountId: 7,
      mediaType: 'ANIME',
    })
    const catalog = await gateway.getMediaListOptionsCatalog({ accountId: 7 })
    const relations = await gateway.readMediaRelations({ accountId: 7, mediaIds: [1] })

    expect(collection).toEqual([
      {
        id: 1,
        userId: 7,
        mediaId: 101,
        media: { id: 101, title: {}, type: 'ANIME', genres: [] },
      },
    ])
    expect(catalog).toEqual({
      animeCustomLists: [],
      mangaCustomLists: [],
    })
    expect(relations).toEqual([])
  })

  it('batches Media(id_in:) reads at fifty and returns requested order', async () => {
    const transport = new ReadTransport()
    transport.responses.push(
      response({ Page: { media: [media(2), media(1), ...Array.from({ length: 48 }, (_, i) => media(i + 3))] } }),
      response({ Page: { media: [media(51)] } }),
    )
    const gateway = new AniListBrowserGateway(transport)

    const result = await gateway.readMediaRelations({
      accountId: 7,
      mediaIds: Array.from({ length: 51 }, (_, index) => index + 1),
    })

    expect(result.map((item) => item.id)).toEqual(
      Array.from({ length: 51 }, (_, index) => index + 1),
    )
    expect(transport.requests).toHaveLength(2)
    expect(transport.requests[0]?.variables.ids).toHaveLength(50)
    expect(transport.requests[0]).toMatchObject({ kind: 'read' })
    expect(transport.requests[0]?.query).toContain('media(id_in: $ids)')
  })

  it('discovers only same-type prequels/sequels, tolerates cycles, and proposes no dates', async () => {
    const transport = new ReadTransport()
    transport.responses.push(
      response({
        Page: {
          media: [
            media(1, {
              relations: {
                edges: [
                  { relationType: 'SEQUEL', node: { id: 2, type: 'ANIME' } },
                  { relationType: 'ADAPTATION', node: { id: 50, type: 'MANGA' } },
                  { relationType: 'PREQUEL', node: { id: 99, type: 'MANGA' } },
                ],
              },
            }),
          ],
        },
      }),
      response({
        Page: {
          media: [
            media(2, {
              countryOfOrigin: 'JP',
              genres: ['Drama'],
              coverImage: { large: 'season-2.jpg', color: '#123456' },
              mediaListEntry: { id: 22, status: 'CURRENT', progress: 2 },
              relations: {
                edges: [
                  { relationType: 'PREQUEL', node: { id: 1, type: 'ANIME' } },
                  { relationType: 'SEQUEL', node: { id: 3, type: 'ANIME' } },
                  { relationType: 'SIDE_STORY', node: { id: 4, type: 'ANIME' } },
                ],
              },
            }),
          ],
        },
      }),
      response({ Page: { media: [media(3, { episodes: null })] } }),
    )
    const discovery = await new AniListBrowserGateway(
      transport,
    ).discoverRelatedSeasons({
      accountId: 7,
      seedId: 1,
      mediaType: 'ANIME',
    })

    expect(discovery.nodes.map((node) => node.id)).toEqual([2, 3])
    expect(discovery.nodes[0]).toMatchObject({
      existingListEntry: { entryId: 22, status: 'CURRENT', progress: 2 },
      selectedByDefault: false,
      proposedAction: { status: 'COMPLETED', progress: 12 },
      depth: 1,
      countryOfOrigin: 'JP',
      genres: ['Drama'],
      coverImage: { large: 'season-2.jpg', color: '#123456' },
    })
    expect(discovery.nodes[1]).toMatchObject({
      existingListEntry: null,
      selectedByDefault: true,
      proposedAction: { status: 'COMPLETED' },
      depth: 2,
    })
    expect(discovery.nodes[1]?.proposedAction).not.toHaveProperty('progress')
    expect(discovery.nodes[1]?.proposedAction).not.toHaveProperty('startedAt')
    expect(discovery.visitedCount).toBe(3)
    expect(discovery.truncated).toBe(false)
  })

  it('caps traversal at 100 visited nodes and reports truncation', async () => {
    const transport = new ReadTransport()
    const edges = Array.from({ length: 120 }, (_, index) => ({
      relationType: 'SEQUEL',
      node: { id: index + 2, type: 'ANIME' },
    }))
    transport.responses.push(
      response({ Page: { media: [media(1, { relations: { edges } })] } }),
      response({
        Page: { media: Array.from({ length: 50 }, (_, index) => media(index + 2)) },
      }),
      response({
        Page: { media: Array.from({ length: 49 }, (_, index) => media(index + 52)) },
      }),
    )

    const discovery = await new AniListBrowserGateway(
      transport,
    ).discoverRelatedSeasons({ accountId: 7, seedId: 1, mediaType: 'ANIME' })

    expect(discovery.nodes).toHaveLength(99)
    expect(discovery.visitedCount).toBe(100)
    expect(discovery.truncated).toBe(true)
    expect(transport.requests).toHaveLength(3)
  })

  it('deduplicates converging relation paths and uses chapter maxima for manga', async () => {
    const transport = new ReadTransport()
    transport.responses.push(
      response({
        Page: {
          media: [
            media(1, {
              type: 'MANGA',
              relations: {
                edges: [
                  { relationType: 'SEQUEL', node: { id: 2, type: 'MANGA' } },
                  { relationType: 'SEQUEL', node: { id: 3, type: 'MANGA' } },
                ],
              },
            }),
          ],
        },
      }),
      response({
        Page: {
          media: [
            media(2, {
              type: 'MANGA',
              relations: {
                edges: [{ relationType: 'SEQUEL', node: { id: 4, type: 'MANGA' } }],
              },
            }),
            media(3, {
              type: 'MANGA',
              relations: {
                edges: [{ relationType: 'SEQUEL', node: { id: 4, type: 'MANGA' } }],
              },
            }),
          ],
        },
      }),
      response({ Page: { media: [media(4, { type: 'MANGA', chapters: 42 })] } }),
    )

    const discovery = await new AniListBrowserGateway(
      transport,
    ).discoverRelatedSeasons({ accountId: 7, seedId: 1, mediaType: 'MANGA' })

    expect(discovery.nodes.map((node) => node.id)).toEqual([2, 3, 4])
    expect(discovery.nodes.filter((node) => node.id === 4)).toHaveLength(1)
    expect(discovery.nodes[2]?.proposedAction).toEqual({
      status: 'COMPLETED',
      progress: 42,
    })
  })

  it('stops a pre-cancelled discovery before any read', async () => {
    const transport = new ReadTransport()
    const controller = new AbortController()
    controller.abort()

    await expect(
      new AniListBrowserGateway(transport).discoverRelatedSeasons({
        accountId: 7,
        seedId: 1,
        mediaType: 'ANIME',
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ kind: 'cancelled' })
    expect(transport.requests).toHaveLength(0)
  })

  it('distinguishes a confirmed 401 from a 403/upstream outage', async () => {
    const authTransport = new ReadTransport()
    authTransport.responses.push(new AniListTransportError('invalid token', { status: 401 }))
    await expect(
      new AniListBrowserGateway(authTransport).loadMediaListCollection({
        accountId: 7,
        mediaType: 'ANIME',
      }),
    ).rejects.toMatchObject({
      kind: 'authentication',
      status: 401,
      confirmedInvalidToken: true,
      retryable: false,
    } satisfies Partial<AniListGatewayError>)

    const outageTransport = new ReadTransport()
    outageTransport.responses.push(new AniListTransportError('forbidden upstream', { status: 403 }))
    await expect(
      new AniListBrowserGateway(outageTransport).getMediaListOptionsCatalog({ accountId: 7 }),
    ).rejects.toMatchObject({
      kind: 'network',
      status: 403,
      confirmedInvalidToken: false,
      retryable: true,
    } satisfies Partial<AniListGatewayError>)
  })

  it('classifies GraphQL authentication errors and rejects a missing seed', async () => {
    const authTransport = new ReadTransport()
    authTransport.responses.push(
      response(
        { Viewer: null },
        [{ message: 'Unauthenticated.', extensions: { status: 401 } }],
      ),
    )
    await expect(
      new AniListBrowserGateway(authTransport).getMediaListOptionsCatalog({ accountId: 7 }),
    ).rejects.toMatchObject({ kind: 'authentication', confirmedInvalidToken: true })

    const missingTransport = new ReadTransport()
    missingTransport.responses.push(response({ Page: { media: [] } }))
    await expect(
      new AniListBrowserGateway(missingTransport).discoverRelatedSeasons({
        accountId: 7,
        seedId: 404,
        mediaType: 'MANGA',
      }),
    ).rejects.toMatchObject({ kind: 'validation' })
  })

  it('offers deterministic collection, catalog, and discovery seams for integration tests', async () => {
    const gateway = new DeterministicAniListGateway()
    gateway.setCollection(7, 'ANIME', [
      {
        id: 11,
        userId: 7,
        mediaId: 1,
        media: { id: 1, title: { userPreferred: 'Seed' }, type: 'ANIME', genres: [] },
      },
    ])
    gateway.setMediaListOptionsCatalog(7, {
      animeCustomLists: ['Seasonal'],
      mangaCustomLists: [],
    })
    gateway.setRelatedMedia({
      id: 1,
      title: { userPreferred: 'Seed' },
      type: 'ANIME',
      genres: [],
      mediaListEntry: { entryId: 11 },
      relations: [{ relationType: 'SEQUEL', mediaId: 2, mediaType: 'ANIME' }],
    })
    gateway.setRelatedMedia({
      id: 2,
      title: { userPreferred: 'Next' },
      type: 'ANIME',
      episodes: 12,
      genres: [],
      mediaListEntry: null,
      relations: [],
    })

    await expect(
      gateway.loadMediaListCollection({ accountId: 7, mediaType: 'ANIME' }),
    ).resolves.toHaveLength(1)
    await expect(
      gateway.getMediaListOptionsCatalog({ accountId: 7 }),
    ).resolves.toMatchObject({ animeCustomLists: ['Seasonal'] })
    await expect(
      gateway.discoverRelatedSeasons({ accountId: 7, seedId: 1, mediaType: 'ANIME' }),
    ).resolves.toMatchObject({ nodes: [{ id: 2, selectedByDefault: true }] })
    expect(gateway.calls.map((call) => call.method)).toContain('readMediaRelations')
  })
})
