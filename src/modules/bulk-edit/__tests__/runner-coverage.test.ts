import { describe, expect, it } from 'vitest'

import {
  DeterministicAniListGateway,
  type GatewayEntrySnapshot,
  type ReadEntriesByMediaIdsOutcome,
  type ReadEntriesOutcome,
} from '../../anilist'
import {
  createBulkEditRunner,
  unchanged,
  type BulkChanges,
  type BulkJobProgress,
} from '..'

const baseChanges = (): BulkChanges => ({
  status: unchanged(),
  score: unchanged(),
  progress: unchanged(),
  private: unchanged(),
  hiddenFromStatusLists: unchanged(),
  notes: unchanged(),
  customLists: {},
})

const snapshot = (
  entryId: number,
  mediaId: number,
  values: GatewayEntrySnapshot['values'] = {},
): GatewayEntrySnapshot => ({ entryId, mediaId, values })

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('BulkEditRunner edge outcomes', () => {
  it('normalizes empty and invalid targets without calling AniList', async () => {
    const gateway = new DeterministicAniListGateway()
    const runner = createBulkEditRunner(gateway)

    const [update, deletion, creation] = await Promise.all([
      runner.start({
        accountId: 1,
        mediaType: 'ANIME',
        entryIds: [0, -1, Number.NaN],
        changes: { ...baseChanges(), score: { kind: 'set', value: 1 } },
      }).result,
      runner.start({
        operation: 'delete',
        accountId: 1,
        mediaType: 'ANIME',
        entryIds: [],
      }).result,
      runner.start({
        operation: 'create',
        accountId: 1,
        mediaType: 'MANGA',
        entries: [{ mediaId: 0, status: 'COMPLETED' }],
      }).result,
    ])

    expect([update.status, deletion.status, creation.status]).toEqual([
      'completed',
      'completed',
      'completed',
    ])
    expect(gateway.calls).toEqual([])
  })

  it('rejects an update with no edit intent as a per-entry validation failure', async () => {
    const gateway = new DeterministicAniListGateway([snapshot(1, 101)])

    const outcome = await createBulkEditRunner(gateway).start({
      accountId: 1,
      mediaType: 'ANIME',
      entryIds: [1],
      changes: baseChanges(),
    }).result

    expect(outcome.status).toBe('failed')
    expect(outcome.failures).toEqual([
      expect.objectContaining({ entryId: 1, kind: 'validation', retryable: false }),
    ])
    expect(gateway.calls).toEqual([])
  })

  it('keeps preflight failures isolated while saving fresh custom-list membership', async () => {
    const gateway = new DeterministicAniListGateway()
    gateway.enqueue('readEntries', {
      entries: [snapshot(1, 101), snapshot(4, 104, { customLists: { Existing: true } })],
      missingIds: [2],
      failures: [
        {
          entryId: 3,
          kind: 'network',
          message: 'offline',
          retryable: true,
          execution: 'not-started',
        },
      ],
      unconfirmedIds: [5],
      unattemptedIds: [6],
    })

    const outcome = await createBulkEditRunner(gateway).start({
      accountId: 1,
      mediaType: 'ANIME',
      entryIds: [1, 2, 3, 4, 5, 6],
      changes: {
        ...baseChanges(),
        status: { kind: 'set', value: 'CURRENT' },
        customLists: { Existing: 'keep', New: 'add', Gone: 'remove' },
      },
    }).result

    expect(outcome.status).toBe('unknown')
    expect(outcome.confirmedPatches.map((patch) => patch.entryId)).toEqual([1, 4])
    expect(outcome.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entryId: 2, kind: 'validation' }),
        expect.objectContaining({ entryId: 3, kind: 'network' }),
        expect.objectContaining({ entryId: 5, kind: 'unknown' }),
      ]),
    )
    expect(outcome.unattemptedIds).toEqual([6])
    expect(gateway.calls[1]).toMatchObject({
      method: 'saveEntries',
      entries: [
        { values: { status: 'CURRENT', customLists: { New: true } } },
        {
          values: {
            status: 'CURRENT',
            customLists: { Existing: true, New: true },
          },
        },
      ],
    })
  })

  it('classifies every targeted update-verification result without a collection load', async () => {
    const gateway = new DeterministicAniListGateway()
    gateway.enqueue('updateShared', {
      confirmed: [{ entryId: 1, values: { notes: '' }, updatedAt: 100 }],
      confirmedDeletedIds: [],
      failures: [],
      unconfirmedIds: [2, 3, 4, 5, 6],
      unattemptedIds: [],
    })
    const verification: ReadEntriesOutcome = {
      entries: [
        { ...snapshot(2, 102, {}), updatedAt: 200 },
        snapshot(3, 103, { notes: 'different' }),
      ],
      missingIds: [4],
      failures: [
        {
          entryId: 5,
          kind: 'network',
          message: 'read failed',
          retryable: true,
          execution: 'not-started',
        },
      ],
      unconfirmedIds: [6],
      unattemptedIds: [],
    }
    gateway.enqueue('readEntries', verification)

    const outcome = await createBulkEditRunner(gateway).start({
      accountId: 1,
      mediaType: 'MANGA',
      entryIds: [1, 2, 3, 4, 5, 6],
      changes: { ...baseChanges(), notes: { kind: 'set', value: '' } },
    }).result

    expect(outcome.status).toBe('unknown')
    expect(outcome.confirmedPatches).toEqual([
      expect.objectContaining({ entryId: 1, updatedAt: 100 }),
      expect.objectContaining({ entryId: 2, updatedAt: 200, values: { notes: '' } }),
    ])
    expect(outcome.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entryId: 3, kind: 'unknown' }),
        expect.objectContaining({ entryId: 4, kind: 'unknown' }),
        expect.objectContaining({
          entryId: 5,
          kind: 'unknown',
          retryable: false,
        }),
        expect.objectContaining({ entryId: 6, kind: 'unknown' }),
      ]),
    )
    expect(gateway.calls.map((call) => call.method)).not.toContain(
      'loadMediaListCollection',
    )
  })

  it('normalizes malformed custom-list verification values as unknown', async () => {
    const gateway = new DeterministicAniListGateway()
    const targets = [
      snapshot(1, 101),
      snapshot(2, 102),
      snapshot(3, 103),
      snapshot(4, 104),
    ]
    gateway.enqueue('readEntries', {
      entries: targets,
      missingIds: [],
      failures: [],
      unconfirmedIds: [],
      unattemptedIds: [],
    })
    gateway.enqueue('saveEntries', {
      confirmed: [],
      confirmedDeletedIds: [],
      failures: [],
      unconfirmedIds: [1, 2, 3, 4],
      unattemptedIds: [],
    })
    gateway.enqueue('readEntries', {
      entries: [
        snapshot(1, 101),
        snapshot(2, 102, { customLists: 'bad' as unknown as Record<string, boolean> }),
        snapshot(3, 103, { customLists: [] as unknown as Record<string, boolean> }),
        snapshot(4, 104, { customLists: { Added: true } }),
      ],
      missingIds: [],
      failures: [],
      unconfirmedIds: [],
      unattemptedIds: [],
    })

    const outcome = await createBulkEditRunner(gateway).start({
      accountId: 1,
      mediaType: 'ANIME',
      entryIds: [1, 2, 3, 4],
      changes: { ...baseChanges(), customLists: { Added: 'add' } },
    }).result

    expect(outcome.status).toBe('unknown')
    expect(outcome.confirmedPatches.map((patch) => patch.entryId)).toEqual([4])
    expect(outcome.failures.map((failure) => failure.entryId)).toEqual([1, 2, 3])
  })

  it('classifies every targeted creation-verification result', async () => {
    const gateway = new DeterministicAniListGateway()
    gateway.enqueue('createEntries', {
      confirmed: [],
      failures: [],
      unconfirmedMediaIds: [101, 102, 103, 104, 105],
      unattemptedMediaIds: [],
    })
    const verification: ReadEntriesByMediaIdsOutcome = {
      entries: [
        {
          entryId: 1,
          mediaId: 101,
          values: { status: 'COMPLETED', progress: 12 },
          updatedAt: 200,
        },
        {
          entryId: 2,
          mediaId: 102,
          values: { status: 'CURRENT', progress: 1 },
        },
      ],
      missingMediaIds: [103],
      failures: [
        {
          mediaId: 104,
          kind: 'network',
          message: 'read failed',
          retryable: true,
          execution: 'not-started',
        },
      ],
      unconfirmedMediaIds: [105],
      unattemptedMediaIds: [],
    }
    gateway.enqueue('readEntriesByMediaIds', verification)

    const outcome = await createBulkEditRunner(gateway).start({
      operation: 'create',
      accountId: 1,
      mediaType: 'ANIME',
      entries: [101, 102, 103, 104, 105].map((mediaId) => ({
        mediaId,
        status: 'COMPLETED' as const,
        progress: 12,
      })),
    }).result

    expect(outcome.status).toBe('unknown')
    expect(outcome.confirmedCreatedEntries).toEqual([
      expect.objectContaining({ mediaId: 101, updatedAt: 200 }),
    ])
    expect(outcome.creationFailures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mediaId: 102, kind: 'unknown' }),
        expect.objectContaining({ mediaId: 103, kind: 'unknown' }),
        expect.objectContaining({
          mediaId: 104,
          kind: 'unknown',
          retryable: false,
        }),
        expect.objectContaining({ mediaId: 105, kind: 'unknown' }),
      ]),
    )
  })

  it('falls back only for readable pre-execution validation failures', async () => {
    const gateway = new DeterministicAniListGateway()
    gateway.enqueue('updateShared', {
      confirmed: [],
      confirmedDeletedIds: [],
      failures: [
        {
          entryId: 1,
          kind: 'validation',
          message: 'unsupported shared mutation',
          retryable: false,
          execution: 'not-started',
        },
      ],
      unconfirmedIds: [],
      unattemptedIds: [],
    })

    const outcome = await createBulkEditRunner(gateway).start({
      accountId: 1,
      mediaType: 'ANIME',
      entryIds: [1],
      changes: { ...baseChanges(), score: { kind: 'set', value: 5 } },
    }).result

    expect(outcome.status).toBe('failed')
    expect(outcome.failures).toEqual([
      expect.objectContaining({ entryId: 1, kind: 'validation' }),
    ])
    expect(gateway.calls.map((call) => call.method)).toEqual([
      'updateShared',
      'readEntries',
    ])
  })

  it('replaces a capability failure with a retryable fallback preflight outage', async () => {
    const gateway = new DeterministicAniListGateway()
    gateway.enqueue('updateShared', {
      confirmed: [],
      confirmedDeletedIds: [],
      failures: [
        {
          entryId: 1,
          kind: 'validation',
          message: 'unsupported shared mutation',
          retryable: false,
          execution: 'not-started',
        },
      ],
      unconfirmedIds: [],
      unattemptedIds: [],
    })
    gateway.enqueue('readEntries', {
      entries: [],
      missingIds: [],
      failures: [
        {
          entryId: 1,
          kind: 'network',
          message: 'fallback preflight unavailable',
          retryable: true,
          execution: 'not-started',
        },
      ],
      unconfirmedIds: [],
      unattemptedIds: [],
    })

    const outcome = await createBulkEditRunner(gateway).start({
      accountId: 1,
      mediaType: 'ANIME',
      entryIds: [1],
      changes: { ...baseChanges(), score: { kind: 'set', value: 5 } },
    }).result

    expect(outcome.failures).toEqual([
      expect.objectContaining({
        entryId: 1,
        kind: 'network',
        retryable: true,
      }),
    ])
    expect(gateway.calls.map((call) => call.method)).toEqual([
      'updateShared',
      'readEntries',
    ])
  })

  it('classifies ambiguous delete verification as missing, present, failed, or unknown', async () => {
    const gateway = new DeterministicAniListGateway()
    gateway.enqueue('deleteEntries', {
      confirmed: [],
      confirmedDeletedIds: [],
      failures: [],
      unconfirmedIds: [1, 2, 3, 4],
      unattemptedIds: [],
    })
    gateway.enqueue('readEntries', {
      entries: [snapshot(2, 102)],
      missingIds: [1],
      failures: [
        {
          entryId: 3,
          kind: 'network',
          message: 'read failed',
          retryable: true,
          execution: 'not-started',
        },
      ],
      unconfirmedIds: [4],
      unattemptedIds: [],
    })

    const outcome = await createBulkEditRunner(gateway).start({
      operation: 'delete',
      accountId: 1,
      mediaType: 'MANGA',
      entryIds: [1, 2, 3, 4],
    }).result

    expect(outcome.status).toBe('unknown')
    expect(outcome.confirmedDeletedIds).toEqual([1])
    expect(outcome.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entryId: 2, kind: 'unknown' }),
        expect.objectContaining({
          entryId: 3,
          kind: 'unknown',
          retryable: false,
        }),
        expect.objectContaining({ entryId: 4, kind: 'unknown' }),
      ]),
    )
  })

  it('lets cancelled ambiguous create, update, and delete mutations settle', async () => {
    const createGateway = new DeterministicAniListGateway()
    const updateGateway = new DeterministicAniListGateway()
    const deleteGateway = new DeterministicAniListGateway()
    const createResult = deferred<Awaited<ReturnType<typeof createGateway.createEntries>>>()
    const updateResult = deferred<Awaited<ReturnType<typeof updateGateway.updateShared>>>()
    const deleteResult = deferred<Awaited<ReturnType<typeof deleteGateway.deleteEntries>>>()
    createGateway.createEntries = () => createResult.promise
    updateGateway.updateShared = () => updateResult.promise
    deleteGateway.deleteEntries = () => deleteResult.promise

    const createHandle = createBulkEditRunner(createGateway).start({
      operation: 'create',
      accountId: 1,
      mediaType: 'ANIME',
      entries: [{ mediaId: 101, status: 'COMPLETED' }],
    })
    const updateHandle = createBulkEditRunner(updateGateway).start({
      accountId: 1,
      mediaType: 'ANIME',
      entryIds: [1],
      changes: { ...baseChanges(), score: { kind: 'set', value: 5 } },
    })
    const deleteHandle = createBulkEditRunner(deleteGateway).start({
      operation: 'delete',
      accountId: 1,
      mediaType: 'ANIME',
      entryIds: [1],
    })
    await Promise.resolve()
    createHandle.cancel()
    updateHandle.cancel()
    deleteHandle.cancel()
    createResult.resolve({
      confirmed: [],
      failures: [],
      unconfirmedMediaIds: [101],
      unattemptedMediaIds: [],
    })
    updateResult.resolve({
      confirmed: [],
      confirmedDeletedIds: [],
      failures: [],
      unconfirmedIds: [1],
      unattemptedIds: [],
    })
    deleteResult.resolve({
      confirmed: [],
      confirmedDeletedIds: [],
      failures: [],
      unconfirmedIds: [1],
      unattemptedIds: [],
    })

    const [creation, update, deletion] = await Promise.all([
      createHandle.result,
      updateHandle.result,
      deleteHandle.result,
    ])
    expect([creation.status, update.status, deletion.status]).toEqual([
      'cancelled',
      'cancelled',
      'cancelled',
    ])
    expect(creation.creationFailures).toHaveLength(1)
    expect(update.failures).toHaveLength(1)
    expect(deletion.failures).toHaveLength(1)
    expect(createGateway.calls).toEqual([])
    expect(updateGateway.calls).toEqual([])
    expect(deleteGateway.calls).toEqual([])
  })

  it('retains every target when cancellation receives no per-target outcome', async () => {
    const createGateway = new DeterministicAniListGateway()
    const updateGateway = new DeterministicAniListGateway()
    const createResult = deferred<Awaited<ReturnType<typeof createGateway.createEntries>>>()
    const updateResult = deferred<Awaited<ReturnType<typeof updateGateway.updateShared>>>()
    createGateway.createEntries = () => createResult.promise
    updateGateway.updateShared = () => updateResult.promise

    const createHandle = createBulkEditRunner(createGateway).start({
      operation: 'create',
      accountId: 1,
      mediaType: 'ANIME',
      entries: [{ mediaId: 101, status: 'COMPLETED' }],
    })
    const updateHandle = createBulkEditRunner(updateGateway).start({
      accountId: 1,
      mediaType: 'ANIME',
      entryIds: [1],
      changes: { ...baseChanges(), score: { kind: 'set', value: 5 } },
    })
    await Promise.resolve()
    createHandle.cancel()
    updateHandle.cancel()
    createResult.resolve({
      confirmed: [],
      failures: [],
      unconfirmedMediaIds: [],
      unattemptedMediaIds: [],
    })
    updateResult.resolve({
      confirmed: [],
      confirmedDeletedIds: [],
      failures: [],
      unconfirmedIds: [],
      unattemptedIds: [],
    })

    const [creation, update] = await Promise.all([
      createHandle.result,
      updateHandle.result,
    ])
    expect(creation.unattemptedMediaIds).toEqual([101])
    expect(update.unattemptedIds).toEqual([1])
  })

  it('deduplicates acknowledgements and lets success take precedence', async () => {
    const createGateway = new DeterministicAniListGateway()
    createGateway.enqueue('createEntries', {
      confirmed: [
        { entryId: 1, mediaId: 101, values: { status: 'CURRENT' } },
        { entryId: 2, mediaId: 101, values: { status: 'COMPLETED' } },
      ],
      failures: [
        {
          mediaId: 101,
          kind: 'validation',
          message: 'stale alias error',
          retryable: false,
          execution: 'not-started',
        },
      ],
      unconfirmedMediaIds: [],
      unattemptedMediaIds: [101],
    })
    const updateGateway = new DeterministicAniListGateway()
    updateGateway.enqueue('updateShared', {
      confirmed: [
        { entryId: 1, values: { score: 1 } },
        { entryId: 1, values: { score: 9 } },
      ],
      confirmedDeletedIds: [1, 1],
      failures: [
        {
          entryId: 1,
          kind: 'validation',
          message: 'stale alias error',
          retryable: false,
          execution: 'completed',
        },
      ],
      unconfirmedIds: [],
      unattemptedIds: [1, 1],
    })
    const deleteGateway = new DeterministicAniListGateway()
    deleteGateway.enqueue('deleteEntries', {
      confirmed: [],
      confirmedDeletedIds: [1, 1],
      failures: [
        {
          entryId: 1,
          kind: 'validation',
          message: 'stale alias error',
          retryable: false,
          execution: 'completed',
        },
      ],
      unconfirmedIds: [],
      unattemptedIds: [1, 1],
    })

    const [creation, update, deletion] = await Promise.all([
      createBulkEditRunner(createGateway).start({
        operation: 'create',
        accountId: 1,
        mediaType: 'ANIME',
        entries: [{ mediaId: 101, status: 'COMPLETED' }],
      }).result,
      createBulkEditRunner(updateGateway).start({
        accountId: 1,
        mediaType: 'ANIME',
        entryIds: [1],
        changes: { ...baseChanges(), score: { kind: 'set', value: 9 } },
      }).result,
      createBulkEditRunner(deleteGateway).start({
        operation: 'delete',
        accountId: 1,
        mediaType: 'ANIME',
        entryIds: [1],
      }).result,
    ])

    expect(creation.confirmedCreatedEntries).toEqual([
      expect.objectContaining({ entryId: 2, mediaId: 101 }),
    ])
    expect(creation.creationFailures).toEqual([])
    expect(creation.unattemptedMediaIds).toEqual([])
    expect(update.confirmedPatches).toEqual([
      expect.objectContaining({ entryId: 1, values: { score: 9 } }),
    ])
    expect(update.confirmedDeletedIds).toEqual([])
    expect(update.failures).toEqual([])
    expect(update.unattemptedIds).toEqual([])
    expect(deletion.confirmedDeletedIds).toEqual([1])
    expect(deletion.failures).toEqual([])
    expect(deletion.unattemptedIds).toEqual([])
  })

  it('marks missing gateway outcomes as unknown instead of assuming success', async () => {
    const createGateway = new DeterministicAniListGateway()
    const updateGateway = new DeterministicAniListGateway()
    createGateway.enqueue('createEntries', {
      confirmed: [],
      failures: [],
      unconfirmedMediaIds: [],
      unattemptedMediaIds: [],
    })
    updateGateway.enqueue('updateShared', {
      confirmed: [],
      confirmedDeletedIds: [],
      failures: [],
      unconfirmedIds: [],
      unattemptedIds: [],
    })

    const [creation, update] = await Promise.all([
      createBulkEditRunner(createGateway).start({
        operation: 'create',
        accountId: 1,
        mediaType: 'ANIME',
        entries: [{ mediaId: 101, status: 'COMPLETED' }],
      }).result,
      createBulkEditRunner(updateGateway).start({
        accountId: 1,
        mediaType: 'ANIME',
        entryIds: [1],
        changes: { ...baseChanges(), score: { kind: 'set', value: 9 } },
      }).result,
    ])

    expect(creation).toMatchObject({
      status: 'unknown',
      creationFailures: [{ mediaId: 101, kind: 'unknown' }],
    })
    expect(update).toMatchObject({
      status: 'unknown',
      failures: [{ entryId: 1, kind: 'unknown' }],
    })
  })

  it('turns catastrophic gateway throws into settled update and create outcomes', async () => {
    const updateGateway = new DeterministicAniListGateway()
    const createGateway = new DeterministicAniListGateway()
    updateGateway.updateShared = async () => {
      throw 'non-error rejection'
    }
    createGateway.createEntries = async () => {
      throw new Error('creation transport exploded')
    }

    const [update, creation] = await Promise.all([
      createBulkEditRunner(updateGateway).start({
        accountId: 1,
        mediaType: 'ANIME',
        entryIds: [1],
        changes: { ...baseChanges(), score: { kind: 'set', value: 9 } },
      }).result,
      createBulkEditRunner(createGateway).start({
        operation: 'create',
        accountId: 1,
        mediaType: 'ANIME',
        entries: [{ mediaId: 101, status: 'COMPLETED' }],
      }).result,
    ])

    expect(update).toMatchObject({
      status: 'unknown',
      failures: [
        { entryId: 1, message: 'Unexpected bulk-job failure.', kind: 'unknown' },
      ],
    })
    expect(creation).toMatchObject({
      status: 'unknown',
      creationFailures: [
        { mediaId: 101, message: 'creation transport exploded', kind: 'unknown' },
      ],
    })
  })

  it('settles catastrophic rejections after cancellation with retryable targets', async () => {
    const createGateway = new DeterministicAniListGateway()
    const updateGateway = new DeterministicAniListGateway()
    const createResult = deferred<never>()
    const updateResult = deferred<never>()
    createGateway.createEntries = () => createResult.promise
    updateGateway.updateShared = () => updateResult.promise

    const createHandle = createBulkEditRunner(createGateway).start({
      operation: 'create',
      accountId: 1,
      mediaType: 'ANIME',
      entries: [{ mediaId: 101, status: 'COMPLETED' }],
    })
    const updateHandle = createBulkEditRunner(updateGateway).start({
      accountId: 1,
      mediaType: 'ANIME',
      entryIds: [1],
      changes: { ...baseChanges(), score: { kind: 'set', value: 9 } },
    })
    await Promise.resolve()
    createHandle.cancel()
    updateHandle.cancel()
    createResult.reject(new Error('cancelled create'))
    updateResult.reject(new Error('cancelled update'))

    const [creation, update] = await Promise.all([
      createHandle.result,
      updateHandle.result,
    ])
    expect(creation).toMatchObject({
      status: 'cancelled',
      creationFailures: [],
      unattemptedMediaIds: [101],
    })
    expect(update).toMatchObject({
      status: 'cancelled',
      failures: [],
      unattemptedIds: [1],
    })
  })

  it('publishes progress through subscription and stops after unsubscribe', async () => {
    const gateway = new DeterministicAniListGateway([snapshot(1, 101)])
    const handle = createBulkEditRunner(gateway).start({
      accountId: 1,
      mediaType: 'ANIME',
      entryIds: [1],
      changes: { ...baseChanges(), score: { kind: 'set', value: 9 } },
    })
    const progress: BulkJobProgress[] = []
    const unsubscribe = handle.subscribe((event) => progress.push(event))

    await handle.result
    unsubscribe()

    expect(progress.map((event) => event.phase)).toEqual([
      'preparing',
      'mutating',
      'mutating',
      'completed',
    ])
    expect(progress.find((event) => event.phase === 'mutating')).toMatchObject({
      attempted: 0,
      confirmed: 0,
      failed: 0,
    })
    expect(
      progress.filter((event) => event.phase === 'mutating').at(-1),
    ).toMatchObject({ attempted: 1, confirmed: 1, failed: 0 })
    expect(progress.at(-1)).toMatchObject({
      total: 1,
      attempted: 1,
      confirmed: 1,
      failed: 0,
      unattempted: 0,
      stats: { limitPerMinute: 30 },
    })

    const silent = createBulkEditRunner(gateway).start({
      operation: 'delete',
      accountId: 1,
      mediaType: 'ANIME',
      entryIds: [1],
    })
    const afterUnsubscribe: BulkJobProgress[] = []
    silent.subscribe((event) => afterUnsubscribe.push(event))()
    await silent.result
    expect(afterUnsubscribe).toEqual([])
  })
})
