import { describe, expect, it } from 'vitest'

import {
  AniListBrowserGateway,
  AniListTransportError,
  SchedulerCancelledError,
  type GatewaySaveRequest,
  type GraphQLRequest,
  type GraphQLResult,
  type GraphQLTransport,
} from '..'

class StubTransport implements GraphQLTransport {
  readonly requests: GraphQLRequest[] = []
  readonly responses: Array<GraphQLResult<Record<string, unknown>> | Error> = []

  async execute<T>(request: GraphQLRequest): Promise<GraphQLResult<T>> {
    this.requests.push(request)
    const response = this.responses.shift()
    if (!response) throw new Error('Missing stub response')
    if (response instanceof Error) throw response
    return response as GraphQLResult<T>
  }
}

const response = (data: Record<string, unknown>, errors: GraphQLResult<unknown>['errors'] = []) => ({
  data,
  errors,
  status: 200,
  rateLimit: {},
})

describe('AniListBrowserGateway', () => {
  it('batches shared changes at 50 list-entry IDs and reconciles sparse records', async () => {
    const transport = new StubTransport()
    transport.responses.push(
      response({
        UpdateMediaListEntries: Array.from({ length: 50 }, (_, index) => ({
          id: index + 1,
          score: 0,
        })),
      }),
      response({ UpdateMediaListEntries: [{ id: 51, score: 0 }] }),
    )
    const gateway = new AniListBrowserGateway(transport)

    const outcome = await gateway.updateShared({
      accountId: 7,
      entryIds: Array.from({ length: 51 }, (_, index) => index + 1),
      values: { score: 0, notes: '' },
    })

    expect(transport.requests).toHaveLength(2)
    expect(transport.requests[0]?.variables.ids).toHaveLength(50)
    expect(transport.requests[1]?.variables.ids).toEqual([51])
    expect(outcome.confirmed[0]?.values).toMatchObject({ score: 0, notes: '' })
    expect(outcome.confirmed).toHaveLength(51)
  })

  it('reports cumulative shared-mutation progress after every chunk', async () => {
    const transport = new StubTransport()
    transport.responses.push(
      response({
        UpdateMediaListEntries: Array.from({ length: 50 }, (_, index) => ({
          id: index + 1,
        })),
      }),
      response({ UpdateMediaListEntries: [{ id: 51 }] }),
    )
    const progress: Array<{
      attempted: number
      confirmed: number
      failed: number
      unattempted: number
    }> = []

    await new AniListBrowserGateway(transport).updateShared({
      accountId: 7,
      entryIds: Array.from({ length: 51 }, (_, index) => index + 1),
      values: { score: 5 },
      onProgress: (event) => progress.push(event),
    })

    expect(progress).toMatchObject([
      { attempted: 50, confirmed: 50, failed: 0, unattempted: 1 },
      { attempted: 51, confirmed: 51, failed: 0, unattempted: 0 },
    ])
  })

  it('reports a terminal transport-error chunk before stopping', async () => {
    const transport = new StubTransport()
    transport.responses.push(
      response({
        UpdateMediaListEntries: Array.from({ length: 50 }, (_, index) => ({
          id: index + 1,
        })),
      }),
      new AniListTransportError('upstream unavailable', { status: 503 }),
    )
    const progress: Array<{
      attempted: number
      confirmed: number
      failed: number
      unattempted: number
    }> = []

    const outcome = await new AniListBrowserGateway(transport).updateShared({
      accountId: 7,
      entryIds: Array.from({ length: 52 }, (_, index) => index + 1),
      values: { score: 5 },
      onProgress: (event) => progress.push(event),
    })

    expect(progress).toMatchObject([
      { attempted: 50, confirmed: 50, failed: 0, unattempted: 2 },
      { attempted: 52, confirmed: 50, failed: 2, unattempted: 0 },
    ])
    expect(outcome.failures).toHaveLength(2)
  })

  it('uses media IDs for aliased saves and verifies alias-level resolver errors', async () => {
    const transport = new StubTransport()
    transport.responses.push(
      response(
        { entry0: { id: 10, mediaId: 100, notes: '' } },
        [{ message: 'invalid progress', path: ['entry1'] }],
      ),
    )
    const gateway = new AniListBrowserGateway(transport)
    const requests: GatewaySaveRequest[] = [
      {
        target: { entryId: 10, mediaId: 100, values: {} },
        values: { notes: '' },
      },
      {
        target: { entryId: 20, mediaId: 200, values: {} },
        values: { notes: '' },
      },
    ]

    const outcome = await gateway.saveEntries({ accountId: 7, entries: requests })

    expect(transport.requests[0]?.variables).toMatchObject({ mediaId0: 100, mediaId1: 200 })
    expect(transport.requests[0]?.variables).not.toMatchObject({ mediaId0: 10 })
    expect(outcome.confirmed.map((item) => item.entryId)).toEqual([10])
    expect(outcome.failures).toEqual([])
    expect(outcome.unconfirmedIds).toEqual([20])
  })

  it('treats omitted aliases as unconfirmed and deletes by list-entry ID', async () => {
    const transport = new StubTransport()
    transport.responses.push(response({ entry0: { id: 1, mediaId: 101 } }))
    transport.responses.push(response({ entry0: { deleted: true } }))
    const gateway = new AniListBrowserGateway(transport)

    const save = await gateway.saveEntries({
      accountId: 7,
      entries: [
        { target: { entryId: 1, mediaId: 101, values: {} }, values: { score: 5 } },
        { target: { entryId: 2, mediaId: 102, values: {} }, values: { score: 5 } },
      ],
    })
    const deletion = await gateway.deleteEntries({ accountId: 7, entryIds: [1, 2] })

    expect(save.unconfirmedIds).toEqual([2])
    expect(transport.requests[1]?.variables).toMatchObject({ entryId0: 1, entryId1: 2 })
    expect(deletion.confirmedDeletedIds).toEqual([1])
    expect(deletion.unconfirmedIds).toEqual([2])
  })

  it('does not schedule a later mutation chunk after cancellation', async () => {
    const controller = new AbortController()
    const requests: GraphQLRequest[] = []
    const transport: GraphQLTransport = {
      async execute<T>(request: GraphQLRequest): Promise<GraphQLResult<T>> {
        requests.push(request)
        controller.abort()
        return response({
          UpdateMediaListEntries: Array.from({ length: 50 }, (_, index) => ({
            id: index + 1,
          })),
        }) as GraphQLResult<T>
      },
    }
    const gateway = new AniListBrowserGateway(transport)
    const progress: Array<{ attempted: number; unattempted: number }> = []

    const outcome = await gateway.updateShared({
      accountId: 7,
      entryIds: Array.from({ length: 51 }, (_, index) => index + 1),
      values: { score: 5 },
      signal: controller.signal,
      onProgress: (event) => progress.push(event),
    })

    expect(requests).toHaveLength(1)
    expect(outcome.confirmed).toHaveLength(50)
    expect(outcome.unattemptedIds).toEqual([51])
    expect(progress).toMatchObject([{ attempted: 50, unattempted: 1 }])
  })

  it('reads targeted entries in alias batches and distinguishes missing, failed, and omitted aliases', async () => {
    const transport = new StubTransport()
    transport.responses.push(
      response(
        {
          entry0: {
            id: 1,
            mediaId: 101,
            status: 'CURRENT',
            customLists: { Seasonal: true },
          },
          entry1: null,
        },
        [{ message: 'invalid id', path: ['entry2'] }],
      ),
    )
    const gateway = new AniListBrowserGateway(transport)

    const outcome = await gateway.readEntries({
      accountId: 7,
      entryIds: [1, 2, 3, 4],
    })

    expect(outcome.entries).toMatchObject([
      {
        entryId: 1,
        mediaId: 101,
        values: { status: 'CURRENT', customLists: { Seasonal: true } },
      },
    ])
    expect(outcome.missingIds).toEqual([2])
    expect(outcome.failures).toMatchObject([{ entryId: 3, kind: 'validation' }])
    expect(outcome.unconfirmedIds).toEqual([4])
    expect(transport.requests[0]?.query).toContain('MediaList(id: $entryId0)')
  })

  it('preserves partial shared success and leaves resolver-path siblings unconfirmed', async () => {
    const transport = new StubTransport()
    transport.responses.push(
      response(
        { UpdateMediaListEntries: [{ id: 1, progress: 0 }] },
        [{ message: 'invalid progress', path: ['UpdateMediaListEntries'] }],
      ),
    )
    const gateway = new AniListBrowserGateway(transport)

    const outcome = await gateway.updateShared({
      accountId: 7,
      entryIds: [1, 2],
      values: { progress: 0 },
    })

    expect(outcome.confirmed.map((item) => item.entryId)).toEqual([1])
    expect(outcome.unconfirmedIds).toEqual([2])
    expect(outcome.failures).toEqual([])
  })

  it('leaves a partial GraphQL 403 result unconfirmed for targeted verification', async () => {
      const transport = new StubTransport()
      transport.responses.push(
        response(
          { UpdateMediaListEntries: [{ id: 1, score: 8 }] },
          [
            {
              message: 'upstream unavailable',
              path: ['UpdateMediaListEntries'],
              extensions: { status: 403 },
            },
          ],
        ),
      )

      const outcome = await new AniListBrowserGateway(transport).updateShared({
        accountId: 7,
        entryIds: [1, 2],
        values: { score: 8 },
      })

      expect(outcome.confirmed.map((item) => item.entryId)).toEqual([1])
      expect(outcome.unconfirmedIds).toEqual([2])
      expect(outcome.failures).toEqual([])
  })

  it('does not trust a validation-looking error in a partial non-2xx response', async () => {
    const transport = new StubTransport()
    transport.responses.push({
      ...response(
        { UpdateMediaListEntries: [{ id: 1, score: 8 }] },
        [{ message: 'invalid upstream response' }],
      ),
      status: 503,
    })

    const outcome = await new AniListBrowserGateway(transport).updateShared({
      accountId: 7,
      entryIds: [1, 2],
      values: { score: 8 },
    })

    expect(outcome.confirmed.map((item) => item.entryId)).toEqual([1])
    expect(outcome.unconfirmedIds).toEqual([2])
    expect(outcome.failures).toEqual([])
  })

  it('does not treat non-2xx mutation data as a pre-execution validation failure', async () => {
    const transport = new StubTransport()
    transport.responses.push({
      ...response(
        { UpdateMediaListEntries: [] },
        [{ message: 'invalid progress' }],
      ),
      status: 422,
    })

    const outcome = await new AniListBrowserGateway(transport).updateShared({
      accountId: 7,
      entryIds: [1],
      values: { progress: 10 },
    })

    expect(outcome.unconfirmedIds).toEqual([1])
    expect(outcome.failures).toEqual([])
  })

  it('keeps execution ambiguous when any applicable error has a resolver path', async () => {
    const transport = new StubTransport()
    transport.responses.push(
      response(
        { UpdateMediaListEntries: [] },
        [
          { message: 'invalid variable' },
          {
            message: 'resolver failed after execution began',
            path: ['UpdateMediaListEntries'],
          },
        ],
      ),
    )

    const outcome = await new AniListBrowserGateway(transport).updateShared({
      accountId: 7,
      entryIds: [1],
      values: { score: 8 },
    })

    expect(outcome.unconfirmedIds).toEqual([1])
    expect(outcome.failures).toEqual([])
  })

  it('leaves a partial GraphQL 5xx result unconfirmed for targeted verification', async () => {
    const transport = new StubTransport()
    transport.responses.push(
      response(
        { UpdateMediaListEntries: [{ id: 1, score: 8 }] },
        [
          {
            message: 'resolver failed after execution began',
            path: ['UpdateMediaListEntries'],
            extensions: { status: 503 },
          },
        ],
      ),
    )

    const outcome = await new AniListBrowserGateway(transport).updateShared({
      accountId: 7,
      entryIds: [1, 2],
      values: { score: 8 },
    })

    expect(outcome.confirmed.map((item) => item.entryId)).toEqual([1])
    expect(outcome.unconfirmedIds).toEqual([2])
    expect(outcome.failures).toEqual([])
  })

  it('marks a lost mutation response ambiguous and leaves later chunks unattempted', async () => {
    const transport = new StubTransport()
    transport.responses.push(
      new AniListTransportError('connection lost', {
        code: 'NETWORK_ERROR',
        ambiguous: true,
      }),
    )
    const gateway = new AniListBrowserGateway(transport)

    const outcome = await gateway.updateShared({
      accountId: 7,
      entryIds: Array.from({ length: 51 }, (_, index) => index + 1),
      values: { private: true },
    })

    expect(outcome.unconfirmedIds).toHaveLength(50)
    expect(outcome.unattemptedIds).toEqual([51])
    expect(transport.requests).toHaveLength(1)
  })

  it('classifies confirmed authentication failures without treating a 403 outage as one', async () => {
    const authenticationTransport = new StubTransport()
    authenticationTransport.responses.push(
      new AniListTransportError('invalid token', { status: 401 }),
    )
    const authentication = await new AniListBrowserGateway(
      authenticationTransport,
    ).updateShared({ accountId: 7, entryIds: [1], values: { score: 1 } })
    expect(authentication.failures).toMatchObject([
      { entryId: 1, kind: 'authentication' },
    ])

    const outageTransport = new StubTransport()
    outageTransport.responses.push(
      new AniListTransportError('upstream forbidden', { status: 403 }),
    )
    const outage = await new AniListBrowserGateway(outageTransport).updateShared({
      accountId: 7,
      entryIds: [1],
      values: { score: 1 },
    })
    expect(outage.failures).toMatchObject([
      { entryId: 1, kind: 'network', retryable: true },
    ])
  })

  it('batches aliased saves at ten entries', async () => {
    const transport = new StubTransport()
    transport.responses.push(
      response(
        Object.fromEntries(
          Array.from({ length: 10 }, (_, index) => [
            `entry${index}`,
            { id: index + 1, mediaId: index + 101 },
          ]),
        ),
      ),
      response({ entry0: { id: 11, mediaId: 111 } }),
    )
    const gateway = new AniListBrowserGateway(transport)
    const entries: GatewaySaveRequest[] = Array.from({ length: 11 }, (_, index) => ({
      target: { entryId: index + 1, mediaId: index + 101, values: {} },
      values: { hiddenFromStatusLists: true },
    }))

    const outcome = await gateway.saveEntries({ accountId: 7, entries })

    expect(outcome.confirmed).toHaveLength(11)
    expect(transport.requests).toHaveLength(2)
    expect(transport.requests[0]?.variables.mediaId9).toBe(110)
    expect(transport.requests[1]?.variables.mediaId0).toBe(111)
  })

  it('maps false and alias-error delete results per entry', async () => {
    const transport = new StubTransport()
    transport.responses.push(
      response(
        { entry0: { deleted: false } },
        [{ message: 'cannot delete', path: ['entry1'] }],
      ),
    )
    const outcome = await new AniListBrowserGateway(transport).deleteEntries({
      accountId: 7,
      entryIds: [1, 2],
    })

    expect(outcome.failures).toMatchObject([
      { entryId: 1, kind: 'unknown' },
    ])
    expect(outcome.unconfirmedIds).toEqual([2])
  })

  it('settles every pre-cancelled operation without scheduling a request', async () => {
    const transport = new StubTransport()
    const gateway = new AniListBrowserGateway(transport)
    const controller = new AbortController()
    controller.abort()
    const target = { entryId: 1, mediaId: 101, values: {} }

    const [read, shared, save, deletion] = await Promise.all([
      gateway.readEntries({
        accountId: 7,
        entryIds: [1],
        signal: controller.signal,
      }),
      gateway.updateShared({
        accountId: 7,
        entryIds: [1],
        values: { score: 1 },
        signal: controller.signal,
      }),
      gateway.saveEntries({
        accountId: 7,
        entries: [{ target, values: { score: 1 } }],
        signal: controller.signal,
      }),
      gateway.deleteEntries({
        accountId: 7,
        entryIds: [1],
        signal: controller.signal,
      }),
    ])

    expect(read.unattemptedIds).toEqual([1])
    expect(shared.unattemptedIds).toEqual([1])
    expect(save.unattemptedIds).toEqual([1])
    expect(deletion.unattemptedIds).toEqual([1])
    expect(transport.requests).toHaveLength(0)
  })

  it('rejects malformed targeted records and normalizes canonical values', async () => {
    const transport = new StubTransport()
    transport.responses.push(
      response({
        entry0: 'not-an-entry',
        entry1: { id: 99, mediaId: 102 },
        entry2: { id: 3, mediaId: null },
        entry3: {
          id: 4,
          mediaId: 104,
          notes: null,
          customLists: null,
          updatedAt: 123,
        },
      }),
    )
    const outcome = await new AniListBrowserGateway(transport).readEntries({
      accountId: 7,
      entryIds: [1, 2, 3, 4],
    })

    expect(outcome.unconfirmedIds).toEqual([1, 2, 3])
    expect(outcome.entries).toEqual([
      {
        entryId: 4,
        mediaId: 104,
        values: { notes: '', customLists: {} },
        updatedAt: 123,
      },
    ])
  })

  it('sends every explicitly set mutable value, including false, zero, and custom lists', async () => {
    const transport = new StubTransport()
    transport.responses.push(
      response({ entry0: { id: 1, mediaId: 101, updatedAt: 999 } }),
    )
    const gateway = new AniListBrowserGateway(transport)
    const outcome = await gateway.saveEntries({
      accountId: 7,
      entries: [
        {
          target: { entryId: 1, mediaId: 101, values: {} },
          values: {
            status: 'COMPLETED',
            score: 0,
            progress: 0,
            private: false,
            hiddenFromStatusLists: false,
            notes: '',
            customLists: { Included: true, Excluded: false },
          },
        },
      ],
    })

    expect(transport.requests[0]?.variables).toMatchObject({
      status0: 'COMPLETED',
      score0: 0,
      progress0: 0,
      private0: false,
      hiddenFromStatusLists0: false,
      notes0: '',
      customLists0: ['Included'],
    })
    expect(outcome.confirmed[0]).toMatchObject({ entryId: 1, updatedAt: 999 })
  })

  it('routes every resolver-path status to targeted verification', async () => {
    const transport = new StubTransport()
    transport.responses.push(
      response({}, [
        { message: 'denied', path: ['entry0'], extensions: { status: 401 } },
        { message: 'slow down', path: ['entry1'], extensions: { statusCode: '429' } },
        { message: 'bad input', path: ['entry2'], extensions: { status: 422 } },
        { message: 'mystery', path: ['entry3'] },
      ]),
    )
    const entries: GatewaySaveRequest[] = Array.from({ length: 4 }, (_, index) => ({
      target: { entryId: index + 1, mediaId: index + 101, values: {} },
      values: { score: 1 },
    }))
    const outcome = await new AniListBrowserGateway(transport).saveEntries({
      accountId: 7,
      entries,
    })

    expect(outcome.failures).toEqual([])
    expect(outcome.unconfirmedIds).toEqual([1, 2, 3, 4])
  })

  it('classifies transport failures and preserves ambiguous delete results', async () => {
    const readTransport = new StubTransport()
    readTransport.responses.push(new Error('broken fixture'))
    const read = await new AniListBrowserGateway(readTransport).readEntries({
      accountId: 7,
      entryIds: [1],
    })
    expect(read.failures).toMatchObject([{ entryId: 1, kind: 'unknown' }])

    const saveTransport = new StubTransport()
    saveTransport.responses.push(new SchedulerCancelledError())
    const save = await new AniListBrowserGateway(saveTransport).saveEntries({
      accountId: 7,
      entries: [
        {
          target: { entryId: 1, mediaId: 101, values: {} },
          values: { score: 1 },
        },
      ],
    })
    expect(save.unattemptedIds).toEqual([1])

    const deleteTransport = new StubTransport()
    deleteTransport.responses.push(
      new AniListTransportError('connection lost', {
        code: 'NETWORK_ERROR',
        ambiguous: true,
      }),
    )
    const deletion = await new AniListBrowserGateway(deleteTransport).deleteEntries({
      accountId: 7,
      entryIds: [1],
    })
    expect(deletion.unconfirmedIds).toEqual([1])
  })

  it('creates entries by media ID with alias-level partial and unknown results', async () => {
    const transport = new StubTransport()
    transport.responses.push(
      response(
        {
          entry0: {
            id: 10,
            mediaId: 100,
            status: 'COMPLETED',
            progress: 0,
            updatedAt: 123,
          },
        },
        [{ message: 'invalid progress', path: ['entry1'] }],
      ),
    )
    const gateway = new AniListBrowserGateway(transport)

    const outcome = await gateway.createEntries({
      accountId: 7,
      entries: [
        { mediaId: 100, status: 'COMPLETED', progress: 0 },
        { mediaId: 200, status: 'COMPLETED', progress: 12 },
        { mediaId: 300, status: 'COMPLETED' },
      ],
    })

    expect(transport.requests[0]?.variables).toMatchObject({
      mediaId0: 100,
      status0: 'COMPLETED',
      progress0: 0,
      mediaId1: 200,
      progress1: 12,
      mediaId2: 300,
    })
    expect(outcome.confirmed).toEqual([
      {
        entryId: 10,
        mediaId: 100,
        values: { status: 'COMPLETED', progress: 0 },
        updatedAt: 123,
      },
    ])
    expect(outcome.failures).toEqual([])
    expect(outcome.unconfirmedMediaIds).toEqual([200, 300])
  })

  it('batches creations at ten and stops after an ambiguous response', async () => {
    const transport = new StubTransport()
    transport.responses.push(
      new AniListTransportError('connection lost', {
        code: 'NETWORK_ERROR',
        ambiguous: true,
      }),
    )
    const gateway = new AniListBrowserGateway(transport)

    const outcome = await gateway.createEntries({
      accountId: 7,
      entries: Array.from({ length: 11 }, (_, index) => ({
        mediaId: index + 100,
        status: 'COMPLETED' as const,
      })),
    })

    expect(transport.requests).toHaveLength(1)
    expect(outcome.unconfirmedMediaIds).toHaveLength(10)
    expect(outcome.unattemptedMediaIds).toEqual([110])
  })

  it('allows the active creation chunk to settle and schedules no later chunk after cancellation', async () => {
    const controller = new AbortController()
    const requests: GraphQLRequest[] = []
    const transport: GraphQLTransport = {
      async execute<T>(request: GraphQLRequest): Promise<GraphQLResult<T>> {
        requests.push(request)
        controller.abort()
        return response(
          Object.fromEntries(
            Array.from({ length: 10 }, (_, index) => [
              `entry${index}`,
              {
                id: index + 1,
                mediaId: index + 100,
                status: 'COMPLETED',
              },
            ]),
          ),
        ) as GraphQLResult<T>
      },
    }
    const outcome = await new AniListBrowserGateway(transport).createEntries({
      accountId: 7,
      entries: Array.from({ length: 11 }, (_, index) => ({
        mediaId: index + 100,
        status: 'COMPLETED' as const,
      })),
      signal: controller.signal,
    })

    expect(requests).toHaveLength(1)
    expect(outcome.confirmed).toHaveLength(10)
    expect(outcome.unattemptedMediaIds).toEqual([110])
  })

  it('target-reads created entries by media ID without a collection query', async () => {
    const transport = new StubTransport()
    transport.responses.push(
      response(
        {
          entry0: { id: 10, mediaId: 100, status: 'COMPLETED', progress: 12 },
          entry1: null,
        },
        [{ message: 'rate limit', path: ['entry2'] }],
      ),
    )
    const outcome = await new AniListBrowserGateway(transport).readEntriesByMediaIds({
      accountId: 7,
      mediaIds: [100, 200, 300, 400],
    })

    expect(outcome.entries).toMatchObject([
      { entryId: 10, mediaId: 100, values: { status: 'COMPLETED', progress: 12 } },
    ])
    expect(outcome.missingMediaIds).toEqual([200])
    expect(outcome.failures).toMatchObject([{ mediaId: 300, kind: 'rate-limit' }])
    expect(outcome.unconfirmedMediaIds).toEqual([400])
    expect(transport.requests[0]?.query).toContain(
      'MediaList(mediaId: $mediaId0, userId: $userId)',
    )
    expect(transport.requests[0]?.query).not.toContain('MediaListCollection')
  })
})
