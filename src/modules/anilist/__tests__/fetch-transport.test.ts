import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  AdaptiveRateScheduler,
  AniListFetchTransport,
  AniListTransportError,
} from '..'

describe('AniListFetchTransport', () => {
  afterEach(() => vi.useRealTimers())
  it('posts directly to AniList, keeps data and errors, and never puts a token in the body', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { entry0: { id: 1 } },
          errors: [{ message: 'entry1 failed', path: ['entry1'] }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    const scheduler = new AdaptiveRateScheduler({
      defaultLimitPerMinute: 60_000,
      sleep: async () => undefined,
    })
    const transport = new AniListFetchTransport({
      fetch: fetcher,
      withAccessToken: async (_accountId, operation) => operation('secret-token'),
      scheduler,
    })

    const result = await transport.execute({
      accountId: 1,
      kind: 'mutation',
      query: 'mutation Test { test }',
      variables: { notes: 'hello' },
    })

    const [url, init] = fetcher.mock.calls[0] ?? []
    expect(url).toBe('https://graphql.anilist.co')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer secret-token')
    expect(String(init?.body)).not.toContain('secret-token')
    expect(result.data).toEqual({ entry0: { id: 1 } })
    expect(result.errors).toEqual([{ message: 'entry1 failed', path: ['entry1'] }])
  })

  it('does not retry a mutation when the response is non-JSON and ambiguous', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('<html>upstream error</html>', { status: 503 }))
    const transport = new AniListFetchTransport({
      fetch: fetcher,
      withAccessToken: async (_accountId, operation) => operation('secret-token'),
      scheduler: new AdaptiveRateScheduler({
        defaultLimitPerMinute: 60_000,
        sleep: async () => undefined,
      }),
    })

    await expect(
      transport.execute({
        accountId: 1,
        kind: 'mutation',
        query: 'mutation Test { test }',
        variables: {},
      }),
    ).rejects.toMatchObject({ ambiguous: true, status: 503 })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('times out a mutation once and preserves its ambiguous result', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('timed out', 'AbortError')),
            { once: true },
          )
        }),
    )
    const transport = new AniListFetchTransport({
      fetch: fetcher,
      requestTimeoutMs: 25,
      withAccessToken: async (_accountId, operation) => operation('secret-token'),
      scheduler: new AdaptiveRateScheduler({
        defaultLimitPerMinute: 60_000,
        sleep: async () => undefined,
      }),
    })

    const result = transport.execute({
      accountId: 1,
      kind: 'mutation',
      query: 'mutation Test { test }',
      variables: {},
    })
    const expectation = expect(result).rejects.toMatchObject({
      code: 'ETIMEDOUT',
      ambiguous: true,
    })
    await vi.advanceTimersByTimeAsync(25)

    await expectation
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['mutation', true],
    ['read', false],
  ] as const)(
    'keeps the timeout active while a %s response body is still streaming',
    async (kind, ambiguous) => {
      vi.useFakeTimers()
      const fetcher = vi.fn<typeof fetch>().mockImplementation(
        async (_input, init) => {
          const response = new Response(null, {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
          vi.spyOn(response, 'text').mockImplementation(
            () =>
              new Promise<string>((resolve, reject) => {
                const eventualBody = globalThis.setTimeout(
                  () => resolve(JSON.stringify({ data: { ok: true } })),
                  100,
                )
                init?.signal?.addEventListener(
                  'abort',
                  () => {
                    globalThis.clearTimeout(eventualBody)
                    reject(new DOMException('timed out', 'AbortError'))
                  },
                  { once: true },
                )
              }),
          )
          return response
        },
      )
      const transport = new AniListFetchTransport({
        fetch: fetcher,
        requestTimeoutMs: 25,
        withAccessToken: async (_accountId, operation) =>
          operation('secret-token'),
        scheduler: new AdaptiveRateScheduler({
          defaultLimitPerMinute: 60_000,
          maxReadRetries: 0,
          sleep: async () => undefined,
        }),
      })

      const result = transport.execute({
        accountId: 1,
        kind,
        query: kind === 'mutation' ? 'mutation Test { test }' : 'query Test { test }',
        variables: {},
      })
      const expectation = expect(result).rejects.toMatchObject({
        code: 'ETIMEDOUT',
        ambiguous,
      })
      await vi.advanceTimersByTimeAsync(100)

      await expectation
      expect(fetcher).toHaveBeenCalledTimes(1)
    },
  )

  it('turns a vault reconnect error into a confirmed authentication failure', async () => {
    const transport = new AniListFetchTransport({
      fetch: vi.fn<typeof fetch>(),
      withAccessToken: async () => {
        throw Object.assign(new Error('Reconnect'), { code: 'reauth-required' })
      },
    })

    await expect(
      transport.execute({
        accountId: 1,
        kind: 'read',
        query: 'query Test { test }',
        variables: {},
      }),
    ).rejects.toEqual(expect.objectContaining<Partial<AniListTransportError>>({ status: 401 }))
  })

  it('retries an idempotent read when a 429 body contains null data', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: null, errors: [{ message: 'Rate limit' }] }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '0' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { Viewer: { id: 1 } } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    const transport = new AniListFetchTransport({
      fetch: fetcher,
      withAccessToken: async (_accountId, operation) => operation('secret-token'),
      scheduler: new AdaptiveRateScheduler({
        defaultLimitPerMinute: 60_000,
        maxReadRetries: 1,
        sleep: async () => undefined,
        random: () => 0,
      }),
    })

    await expect(
      transport.execute({
        accountId: 1,
        kind: 'read',
        query: 'query Viewer { Viewer { id } }',
        variables: {},
      }),
    ).resolves.toMatchObject({ data: { Viewer: { id: 1 } } })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('retries a no-data read when GraphQL carries the transient status', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { Viewer: null },
            errors: [
              {
                message: 'Upstream unavailable',
                extensions: { status: 503 },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { Viewer: { id: 1 } } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    const transport = new AniListFetchTransport({
      fetch: fetcher,
      withAccessToken: async (_accountId, operation) =>
        operation('secret-token'),
      scheduler: new AdaptiveRateScheduler({
        defaultLimitPerMinute: 60_000,
        maxReadRetries: 1,
        sleep: async () => undefined,
        random: () => 0,
      }),
    })

    await expect(
      transport.execute({
        accountId: 1,
        kind: 'read',
        query: 'query Viewer { Viewer { id } }',
        variables: {},
      }),
    ).resolves.toMatchObject({ data: { Viewer: { id: 1 } } })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(transport.scheduler.getStats().retriedRequests).toBe(1)
  })

  it('preserves alias-level data beside a global transient GraphQL error', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { entry0: { id: 1 }, entry1: null },
          errors: [
            {
              message: 'Upstream unavailable',
              extensions: { statusCode: '503' },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    const transport = new AniListFetchTransport({
      fetch: fetcher,
      withAccessToken: async (_accountId, operation) =>
        operation('secret-token'),
      scheduler: new AdaptiveRateScheduler({
        defaultLimitPerMinute: 60_000,
        sleep: async () => undefined,
      }),
    })

    await expect(
      transport.execute({
        accountId: 1,
        kind: 'read',
        query: 'query Entries { entry0: MediaList(id: 1) { id } }',
        variables: {},
      }),
    ).resolves.toMatchObject({ data: { entry0: { id: 1 }, entry1: null } })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('retries transient HTTP reads whose JSON body has no usable data', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { Viewer: null } }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { Viewer: { id: 1 } } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    const transport = new AniListFetchTransport({
      fetch: fetcher,
      withAccessToken: async (_accountId, operation) =>
        operation('secret-token'),
      scheduler: new AdaptiveRateScheduler({
        defaultLimitPerMinute: 60_000,
        maxReadRetries: 1,
        sleep: async () => undefined,
        random: () => 0,
      }),
    })

    await expect(
      transport.execute({
        accountId: 1,
        kind: 'read',
        query: 'query Viewer { Viewer { id } }',
        variables: {},
      }),
    ).resolves.toMatchObject({ data: { Viewer: { id: 1 } } })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('keeps usable partial read data on a transient HTTP response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { entry0: { id: 1 }, entry1: null },
          errors: [{ message: 'entry1 unavailable', path: ['entry1'] }],
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    const transport = new AniListFetchTransport({
      fetch: fetcher,
      withAccessToken: async (_accountId, operation) =>
        operation('secret-token'),
      scheduler: new AdaptiveRateScheduler({
        defaultLimitPerMinute: 60_000,
        sleep: async () => undefined,
      }),
    })

    await expect(
      transport.execute({
        accountId: 1,
        kind: 'read',
        query: 'query Entries { entry0: MediaList(id: 1) { id } }',
        variables: {},
      }),
    ).resolves.toMatchObject({
      status: 503,
      data: { entry0: { id: 1 }, entry1: null },
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
