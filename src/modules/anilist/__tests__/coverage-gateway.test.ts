import { describe, expect, it, vi } from 'vitest'

import {
  AdaptiveRateScheduler,
  AniListBrowserGateway,
  AniListTransportError,
  SchedulerCancelledError,
  createBrowserAniListGateway,
  type GatewaySaveRequest,
  type GraphQLRequest,
  type GraphQLResult,
  type GraphQLTransport,
} from '..'

class QueueTransport implements GraphQLTransport {
  readonly requests: GraphQLRequest[] = []
  readonly responses: Array<GraphQLResult<Record<string, unknown>> | unknown> = []

  async execute<T>(request: GraphQLRequest): Promise<GraphQLResult<T>> {
    this.requests.push(request)
    const response = this.responses.shift()
    if (response instanceof Error) throw response
    if (response === undefined) throw new Error('Missing queued response')
    if (
      response === null ||
      typeof response !== 'object' ||
      !('status' in response)
    ) {
      throw response
    }
    return response as GraphQLResult<T>
  }
}

const result = (
  data: Record<string, unknown> | null,
  errors: GraphQLResult<unknown>['errors'] = [],
  status = 200,
): GraphQLResult<Record<string, unknown>> => ({ data, errors, status, rateLimit: {} })

const target = (entryId: number): GatewaySaveRequest => ({
  target: { entryId, mediaId: entryId + 100, values: {} },
  values: { score: 1 },
})

describe('AniListBrowserGateway coverage: reads and stats', () => {
  it('returns both the fallback and transport scheduler rate stats', () => {
    const plain = new AniListBrowserGateway(new QueueTransport())
    expect(plain.getRateLimitStats()).toMatchObject({
      totalRequests: 0,
      limitPerMinute: 30,
      remaining: null,
    })

    const scheduler = new AdaptiveRateScheduler({ defaultLimitPerMinute: 77 })
    const transport = Object.assign(new QueueTransport(), { scheduler })
    expect(new AniListBrowserGateway(transport).getRateLimitStats().limitPerMinute).toBe(77)
  })

  it('deduplicates and rejects invalid targeted IDs while preserving global errors', async () => {
    const transport = new QueueTransport()
    transport.responses.push(
      result(null, [{ message: 'too many requests' }]),
      result({
        entry0: { id: 2, mediaId: 102, notes: 'kept', customLists: ['invalid'] },
      }),
    )
    const gateway = new AniListBrowserGateway(transport)

    const failed = await gateway.readEntries({
      accountId: 7,
      entryIds: [1, 1, 0, -1, Number.NaN],
    })
    const loaded = await gateway.readEntries({ accountId: 7, entryIds: [2] })

    expect(transport.requests[0]?.variables).toEqual({ entryId0: 1 })
    expect(failed.failures).toMatchObject([{ entryId: 1, kind: 'rate-limit' }])
    expect(loaded.entries).toEqual([
      { entryId: 2, mediaId: 102, values: { notes: 'kept', customLists: {} } },
    ])
  })

  it('settles targeted read cancellation and transport failures without later chunks', async () => {
    const cancelled = new QueueTransport()
    cancelled.responses.push(new SchedulerCancelledError())
    const cancelledOutcome = await new AniListBrowserGateway(cancelled).readEntries({
      accountId: 7,
      entryIds: Array.from({ length: 11 }, (_, index) => index + 1),
    })
    expect(cancelledOutcome.unattemptedIds).toEqual(
      Array.from({ length: 11 }, (_, index) => index + 1),
    )

    const broken = new QueueTransport()
    broken.responses.push(new AniListTransportError('offline', { status: 503 }))
    const brokenOutcome = await new AniListBrowserGateway(broken).readEntries({
      accountId: 7,
      entryIds: Array.from({ length: 11 }, (_, index) => index + 1),
    })
    expect(brokenOutcome.failures).toHaveLength(10)
    expect(brokenOutcome.failures[0]).toMatchObject({ kind: 'network', retryable: true })
    expect(brokenOutcome.unattemptedIds).toEqual([11])
  })

  it('covers media-ID reads that are malformed, globally failed, cancelled, and pre-cancelled', async () => {
    const transport = new QueueTransport()
    transport.responses.push(
      result(
        {
          entry0: [],
          entry1: { id: 20, mediaId: 999 },
        },
        [{ message: 'not authenticated' }],
      ),
    )
    const malformed = await new AniListBrowserGateway(transport).readEntriesByMediaIds({
      accountId: 7,
      mediaIds: [100, 200, 300],
    })
    expect(malformed.unconfirmedMediaIds).toEqual([100, 200])
    expect(malformed.failures).toMatchObject([{ mediaId: 300, kind: 'authentication' }])

    const cancelled = new QueueTransport()
    cancelled.responses.push(new SchedulerCancelledError())
    await expect(
      new AniListBrowserGateway(cancelled).readEntriesByMediaIds({
        accountId: 7,
        mediaIds: [100, 200],
      }),
    ).resolves.toMatchObject({ unattemptedMediaIds: [100, 200] })

    const failed = new QueueTransport()
    failed.responses.push(new AniListTransportError('bad request', { status: 400 }))
    await expect(
      new AniListBrowserGateway(failed).readEntriesByMediaIds({
        accountId: 7,
        mediaIds: [100],
      }),
    ).resolves.toMatchObject({ failures: [{ mediaId: 100, kind: 'validation' }] })

    const controller = new AbortController()
    controller.abort()
    const never = new QueueTransport()
    await expect(
      new AniListBrowserGateway(never).readEntriesByMediaIds({
        accountId: 7,
        mediaIds: [100],
        signal: controller.signal,
      }),
    ).resolves.toMatchObject({ unattemptedMediaIds: [100] })
    expect(never.requests).toHaveLength(0)
  })
})

describe('AniListBrowserGateway coverage: mutation outcomes', () => {
  it('classifies message-only GraphQL failures through public targeted reads', async () => {
    const messages = [
      'Unauthenticated user',
      'not authenticated here',
      'too many requests',
      'validation failed',
      'bad argument',
      'bad variable',
      'score must be positive',
      'cannot update entry',
      'opaque failure',
    ]
    const transport = new QueueTransport()
    transport.responses.push(
      result(
        {},
        messages.map((message, index) => ({ message, path: [`entry${index}`] })),
      ),
    )

    const outcome = await new AniListBrowserGateway(transport).readEntries({
      accountId: 7,
      entryIds: messages.map((_, index) => index + 1),
    })

    expect(outcome.failures.map((failure) => failure.kind)).toEqual([
      'authentication',
      'authentication',
      'rate-limit',
      'validation',
      'validation',
      'validation',
      'validation',
      'validation',
      'unknown',
    ])
  })

  it('handles malformed shared results plus cancelled and known shared failures', async () => {
    const malformed = new QueueTransport()
    malformed.responses.push(
      result({ UpdateMediaListEntries: [null, 'bad', { id: 999 }, { id: -1 }] }),
    )
    await expect(
      new AniListBrowserGateway(malformed).updateShared({
        accountId: 7,
        entryIds: [1],
        values: {},
      }),
    ).resolves.toMatchObject({ unconfirmedIds: [1] })

    const cancelled = new QueueTransport()
    cancelled.responses.push(new SchedulerCancelledError())
    await expect(
      new AniListBrowserGateway(cancelled).updateShared({
        accountId: 7,
        entryIds: [1],
        values: {},
      }),
    ).resolves.toMatchObject({ unattemptedIds: [1] })

    const limited = new QueueTransport()
    limited.responses.push(new AniListTransportError('slow down', { status: 429 }))
    await expect(
      new AniListBrowserGateway(limited).updateShared({
        accountId: 7,
        entryIds: [1],
        values: {},
      }),
    ).resolves.toMatchObject({ failures: [{ entryId: 1, kind: 'rate-limit' }] })
  })

  it('settles known, cancelled, global, and malformed save results', async () => {
    const cases: Array<unknown> = [
      new AniListTransportError('unprocessable', { status: 422 }),
      new SchedulerCancelledError(),
      result(null, [{ message: 'invalid token' }]),
      result({ entry0: null }),
    ]
    const outcomes = []
    for (const response of cases) {
      const transport = new QueueTransport()
      transport.responses.push(response)
      outcomes.push(
        await new AniListBrowserGateway(transport).saveEntries({
          accountId: 7,
          entries: [target(1)],
        }),
      )
    }

    expect(outcomes[0]?.failures).toMatchObject([{ kind: 'validation' }])
    expect(outcomes[1]?.unattemptedIds).toEqual([1])
    expect(outcomes[2]?.failures).toMatchObject([{ kind: 'authentication' }])
    expect(outcomes[3]?.unconfirmedIds).toEqual([1])
  })

  it('deduplicates create targets and settles every create terminal branch', async () => {
    const valid = new QueueTransport()
    valid.responses.push(result({ entry0: { id: 10, mediaId: 100 } }))
    const deduplicated = await new AniListBrowserGateway(valid).createEntries({
      accountId: 7,
      entries: [
        { mediaId: 0, status: 'CURRENT' },
        { mediaId: Number.NaN, status: 'CURRENT' },
        { mediaId: 100, status: 'CURRENT', progress: 1 },
        { mediaId: 100, status: 'COMPLETED' },
      ],
    })
    expect(valid.requests[0]?.variables).toMatchObject({
      mediaId0: 100,
      status0: 'COMPLETED',
    })
    expect(valid.requests[0]?.variables).not.toHaveProperty('progress0')
    expect(deduplicated.confirmed).toHaveLength(1)

    const failures: Array<[unknown, Record<string, unknown>]> = [
      [new SchedulerCancelledError(), { unattemptedMediaIds: [100] }],
      [new AniListTransportError('bad', { status: 422 }), { failures: [{ kind: 'validation' }] }],
      [result(null, [{ message: 'rate limit exceeded' }]), { failures: [{ kind: 'rate-limit' }] }],
      [result({ entry0: { id: 10, mediaId: 999 } }), { unconfirmedMediaIds: [100] }],
    ]
    for (const [response, expected] of failures) {
      const transport = new QueueTransport()
      transport.responses.push(response)
      await expect(
        new AniListBrowserGateway(transport).createEntries({
          accountId: 7,
          entries: [{ mediaId: 100, status: 'CURRENT' }],
        }),
      ).resolves.toMatchObject(expected)
    }

    const controller = new AbortController()
    controller.abort()
    await expect(
      new AniListBrowserGateway(new QueueTransport()).createEntries({
        accountId: 7,
        entries: [{ mediaId: 100, status: 'CURRENT' }],
        signal: controller.signal,
      }),
    ).resolves.toMatchObject({ unattemptedMediaIds: [100] })
  })

  it('settles known, cancelled, global, and malformed delete results', async () => {
    const cases: Array<[unknown, Record<string, unknown>]> = [
      [new SchedulerCancelledError(), { unattemptedIds: [1] }],
      [new AniListTransportError('upstream', { status: 503 }), { failures: [{ kind: 'network' }] }],
      [result(null, [{ message: 'bad argument' }]), { failures: [{ kind: 'validation' }] }],
      [result({ entry0: [] }), { unconfirmedIds: [1] }],
    ]
    for (const [response, expected] of cases) {
      const transport = new QueueTransport()
      transport.responses.push(response)
      await expect(
        new AniListBrowserGateway(transport).deleteEntries({ accountId: 7, entryIds: [1] }),
      ).resolves.toMatchObject(expected)
    }
  })

  it('constructs the browser gateway with its direct fetch adapter', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: { entry0: { id: 1, mediaId: 101 } } }), {
        status: 200,
      }),
    )
    const gateway = createBrowserAniListGateway({
      fetch: fetcher,
      withAccessToken: async (_accountId, operation) => operation('token'),
      scheduler: new AdaptiveRateScheduler({
        defaultLimitPerMinute: 60_000,
        sleep: async () => undefined,
      }),
    })

    await expect(gateway.readEntries({ accountId: 7, entryIds: [1] })).resolves.toMatchObject({
      entries: [{ entryId: 1, mediaId: 101 }],
    })
    expect(gateway.getRateLimitStats().successfulRequests).toBe(1)
  })
})
