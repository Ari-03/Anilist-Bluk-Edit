import { describe, expect, it, vi } from 'vitest'

import {
  AdaptiveRateScheduler,
  AniListBrowserGateway,
  AniListFetchTransport,
  AniListGatewayError,
  AniListTransportError,
  SchedulerCancelledError,
  readRateLimitHints,
  type GraphQLRequest,
  type GraphQLResult,
  type GraphQLTransport,
} from '..'

const fastScheduler = () =>
  new AdaptiveRateScheduler({
    defaultLimitPerMinute: 60_000,
    maxReadRetries: 0,
    sleep: async () => undefined,
  })

const request = (
  kind: 'read' | 'mutation' = 'read',
  signal?: AbortSignal,
): GraphQLRequest => ({
  accountId: 7,
  kind,
  query: `${kind} Test { test }`,
  variables: {},
  signal,
})

const transport = (
  fetcher: typeof fetch,
  withAccessToken: ConstructorParameters<typeof AniListFetchTransport>[0]['withAccessToken'] =
    async (_accountId, operation) => operation('token'),
) =>
  new AniListFetchTransport({
    fetch: fetcher,
    withAccessToken,
    scheduler: fastScheduler(),
  })

class ReadQueue implements GraphQLTransport {
  readonly responses: Array<GraphQLResult<unknown> | unknown> = []
  readonly requests: GraphQLRequest[] = []

  async execute<T>(next: GraphQLRequest): Promise<GraphQLResult<T>> {
    this.requests.push(next)
    const value = this.responses.shift()
    if (value instanceof Error) throw value
    if (value === undefined) throw new Error('Missing read fixture')
    if (value === null || typeof value !== 'object' || !('status' in value)) throw value
    return value as GraphQLResult<T>
  }
}

const gql = <T>(
  data: T | null,
  options: { errors?: GraphQLResult<T>['errors']; status?: number } = {},
): GraphQLResult<T> => ({
  data,
  errors: options.errors ?? [],
  status: options.status ?? 200,
  rateLimit: {},
})

describe('AniList fetch transport coverage', () => {
  it('parses numeric, date, absent, blank, and invalid rate-limit headers', () => {
    expect(readRateLimitHints(new Headers(), 1_000)).toEqual({})
    expect(
      readRateLimitHints(
        new Headers({
          'X-RateLimit-Limit': '90',
          'X-RateLimit-Remaining': '  ',
          'X-RateLimit-Reset': 'invalid',
          'Retry-After': '-2',
        }),
        1_000,
      ),
    ).toEqual({ limit: 90, retryAfterMs: 0 })
    expect(
      readRateLimitHints(
        new Headers({
          'X-RateLimit-Remaining': '12',
          'X-RateLimit-Reset': '3',
          'Retry-After': 'Thu, 01 Jan 1970 00:00:05 GMT',
        }),
        1_000,
      ),
    ).toEqual({ remaining: 12, resetAt: 3_000, retryAfterMs: 4_000 })
    expect(readRateLimitHints(new Headers({ 'Retry-After': 'not-a-date' }), 0)).toEqual(
      {},
    )
  })

  it('returns empty and partial bodies without inventing GraphQL errors', async () => {
    const empty = transport(
      vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 200 })),
    )
    await expect(empty.execute(request())).resolves.toEqual({
      data: null,
      errors: [],
      status: 200,
      rateLimit: {},
    })

    const partial = transport(
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ data: { test: true } }), { status: 503 }),
      ),
    )
    await expect(partial.execute(request())).resolves.toMatchObject({
      data: { test: true },
      status: 503,
    })
  })

  it('classifies fetch failures for reads, mutations, and aborted reads', async () => {
    const network = new Error('offline')
    const read = transport(vi.fn<typeof fetch>().mockRejectedValue(network))
    await expect(read.execute(request('read'))).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      ambiguous: false,
    })

    const mutation = transport(vi.fn<typeof fetch>().mockRejectedValue(network))
    await expect(mutation.execute(request('mutation'))).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      ambiguous: true,
    })

    const controller = new AbortController()
    const aborted = transport(
      vi.fn<typeof fetch>().mockImplementation(async () => {
        controller.abort()
        throw new DOMException('aborted', 'AbortError')
      }),
    )
    await expect(aborted.execute(request('read', controller.signal))).rejects.toBeInstanceOf(
      SchedulerCancelledError,
    )
  })

  it.each([
    [400, false],
    [401, false],
    [403, false],
    [422, false],
    [429, false],
    [500, true],
  ])('marks mutation HTTP %i ambiguity as %s', async (status, ambiguous) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: null }), { status }),
    )
    await expect(transport(fetcher).execute(request('mutation'))).rejects.toMatchObject({
      status,
      ambiguous,
      message: `AniList request failed (${status}).`,
    })
  })

  it('uses GraphQL error text, captures non-JSON read status, and preserves headers', async () => {
    const graphQL = transport(
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({ data: null, errors: [{ message: 'specific failure' }] }),
          { status: 418 },
        ),
      ),
    )
    await expect(graphQL.execute(request('read'))).rejects.toMatchObject({
      message: 'specific failure',
      status: 418,
    })

    const invalid = transport(
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response('not json', {
          status: 502,
          headers: { 'X-RateLimit-Limit': '30' },
        }),
      ),
    )
    await expect(invalid.execute(request('read'))).rejects.toMatchObject({
      status: 502,
      ambiguous: false,
      rateLimit: { limit: 30 },
    })
  })

  it('normalizes both vault reconnect codes while passing unrelated failures through', async () => {
    for (const code of ['reauth-required', 'account-not-found']) {
      const vault = transport(vi.fn<typeof fetch>(), async () => {
        throw Object.assign(new Error('vault'), { code })
      })
      await expect(vault.execute(request())).rejects.toMatchObject({
        status: 401,
        ambiguous: false,
      })
    }

    const sentinel = new Error('other')
    const unrelated = transport(vi.fn<typeof fetch>(), async () => {
      throw sentinel
    })
    await expect(unrelated.execute(request())).rejects.toBe(sentinel)

    const primitive = transport(vi.fn<typeof fetch>(), async () => {
      throw 'primitive'
    })
    await expect(primitive.execute(request())).rejects.toBe('primitive')
  })
})

describe('AniList read-side terminal coverage', () => {
  it('rejects invalid collection and option envelopes', async () => {
    const queue = new ReadQueue()
    queue.responses.push(gql({}), gql({ Viewer: null }))
    const gateway = new AniListBrowserGateway(queue)

    await expect(
      gateway.loadMediaListCollection({ accountId: 7, mediaType: 'ANIME' }),
    ).rejects.toMatchObject({ kind: 'unknown', retryable: true })
    await expect(gateway.getMediaListOptionsCatalog({ accountId: 7 })).rejects.toMatchObject({
      kind: 'unknown',
      retryable: true,
    })
  })

  it('classifies read GraphQL message branches and unusual HTTP/data envelopes', async () => {
    const graphQLCases: Array<[GraphQLResult<unknown>, string]> = [
      [gql({}, { errors: [{ message: 'invalid token' }] }), 'authentication'],
      [gql({}, { errors: [{ message: 'too many requests' }] }), 'rate-limit'],
      [gql({}, { errors: [{ message: 'validation failed' }] }), 'validation'],
      [gql({}, { errors: [{ message: 'upstream issue' }] }), 'network'],
      [gql({}, { errors: [{ message: 'opaque issue' }] }), 'unknown'],
      [gql({}, { status: 500 }), 'network'],
      [gql(null), 'unknown'],
    ]

    for (const [fixture, kind] of graphQLCases) {
      const queue = new ReadQueue()
      queue.responses.push(fixture)
      await expect(
        new AniListBrowserGateway(queue).getMediaListOptionsCatalog({ accountId: 7 }),
      ).rejects.toMatchObject({ kind })
    }
  })

  it('normalizes cancelled, existing gateway, transport, Error, and primitive read failures', async () => {
    const existing = new AniListGatewayError('existing', {
      kind: 'validation',
      retryable: false,
    })
    const cases: Array<[unknown, string]> = [
      [new SchedulerCancelledError(), 'cancelled'],
      [existing, 'validation'],
      [new AniListTransportError('network', { code: 'NETWORK_ERROR' }), 'network'],
      [new Error('plain'), 'unknown'],
      ['primitive', 'unknown'],
    ]
    for (const [failure, kind] of cases) {
      const queue = new ReadQueue()
      queue.responses.push(failure)
      await expect(
        new AniListBrowserGateway(queue).loadMediaListCollection({
          accountId: 7,
          mediaType: 'ANIME',
        }),
      ).rejects.toMatchObject({ kind })
    }
  })

  it('skips invalid collection lists and relations, and cancels relation reads', async () => {
    const queue = new ReadQueue()
    queue.responses.push(
      gql({ MediaListCollection: { lists: [{}, { entries: [null, 'bad'] }] } }),
      gql({
        Page: {
          media: [
            null,
            { id: -1, type: 'ANIME' },
            {
              id: 1,
              type: 'ANIME',
              title: { english: null, native: 'Native' },
              startDate: 'bad',
              coverImage: [],
              mediaListEntry: { id: -1 },
              relations: {
                edges: [null, { relationType: 1 }, { relationType: 'SEQUEL', node: { id: 2, type: 'MANGA' } }],
              },
            },
          ],
        },
      }),
    )
    const gateway = new AniListBrowserGateway(queue)
    await expect(
      gateway.loadMediaListCollection({ accountId: 7, mediaType: 'ANIME' }),
    ).resolves.toEqual([])
    await expect(gateway.readMediaRelations({ accountId: 7, mediaIds: [0, 1, 1] })).resolves.toMatchObject([
      { id: 1, type: 'ANIME', mediaListEntry: null },
    ])

    const controller = new AbortController()
    controller.abort()
    await expect(
      gateway.readMediaRelations({ accountId: 7, mediaIds: [1], signal: controller.signal }),
    ).rejects.toMatchObject({ kind: 'cancelled' })
  })
})
