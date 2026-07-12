import { describe, expect, it } from 'vitest'

import { DeterministicAniListGateway } from '../../anilist'
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

describe('BulkEditRunner', () => {
  it('supports zero values and clearing notes without a collection reload', async () => {
    const gateway = new DeterministicAniListGateway([
      { entryId: 1, mediaId: 101, values: { score: 8, progress: 3, notes: 'old' } },
    ])
    const runner = createBulkEditRunner(gateway)

    const outcome = await runner.start({
      accountId: 9,
      mediaType: 'ANIME',
      entryIds: [1],
      changes: {
        ...baseChanges(),
        score: { kind: 'set', value: 0 },
        progress: { kind: 'set', value: 0 },
        notes: { kind: 'set', value: '' },
      },
    }).result

    expect(outcome.status).toBe('completed')
    expect(outcome.confirmedPatches).toEqual([
      expect.objectContaining({
        entryId: 1,
        mediaType: 'ANIME',
        values: expect.objectContaining({ score: 0, progress: 0, notes: '' }),
      }),
    ])
    expect(gateway.calls.map((call) => call.method)).toEqual(['updateShared'])
  })

  it('preflights custom-list membership and preserves unrelated lists', async () => {
    const gateway = new DeterministicAniListGateway([
      {
        entryId: 1,
        mediaId: 101,
        values: { customLists: { Keep: true, Remove: true, Disabled: false } },
      },
    ])
    const runner = createBulkEditRunner(gateway)

    const outcome = await runner.start({
      accountId: 9,
      mediaType: 'ANIME',
      entryIds: [1],
      changes: {
        ...baseChanges(),
        customLists: { Add: 'add', Remove: 'remove' },
      },
    }).result

    expect(outcome.status).toBe('completed')
    expect(gateway.calls.map((call) => call.method)).toEqual(['readEntries', 'saveEntries'])
    expect(gateway.calls[1]).toMatchObject({
      method: 'saveEntries',
      entries: [{ values: { customLists: { Keep: true, Add: true } } }],
    })
  })

  it('does not reinterpret a custom-list preflight read failure as an ambiguous mutation', async () => {
    const gateway = new DeterministicAniListGateway()
    gateway.enqueue('readEntries', {
      entries: [],
      missingIds: [],
      failures: [
        {
          entryId: 1,
          kind: 'validation',
          message: 'resolver rejected the read',
          retryable: false,
          execution: 'unknown',
        },
      ],
      unconfirmedIds: [],
      unattemptedIds: [],
    })

    const outcome = await createBulkEditRunner(gateway).start({
      accountId: 9,
      mediaType: 'ANIME',
      entryIds: [1],
      changes: {
        ...baseChanges(),
        customLists: { Seasonal: 'add' },
      },
    }).result

    expect(outcome.status).toBe('failed')
    expect(outcome.failures).toMatchObject([
      { entryId: 1, kind: 'validation', retryable: false },
    ])
    expect(gateway.calls.map((call) => call.method)).toEqual(['readEntries'])
  })

  it('target-verifies an omitted mutation response instead of reloading a collection', async () => {
    const gateway = new DeterministicAniListGateway([
      { entryId: 1, mediaId: 101, values: { score: 2 } },
    ])
    gateway.enqueue('updateShared', {
      confirmed: [],
      confirmedDeletedIds: [],
      failures: [],
      unconfirmedIds: [1],
      unattemptedIds: [],
    })
    gateway.setEntry({ entryId: 1, mediaId: 101, values: { score: 10 } })
    const runner = createBulkEditRunner(gateway)

    const outcome = await runner.start({
      accountId: 9,
      mediaType: 'MANGA',
      entryIds: [1],
      changes: { ...baseChanges(), score: { kind: 'set', value: 10 } },
    }).result

    expect(outcome.status).toBe('completed')
    expect(gateway.calls.map((call) => call.method)).toEqual(['updateShared', 'readEntries'])
    expect(outcome.confirmedPatches[0]).toMatchObject({
      entryId: 1,
      mediaType: 'MANGA',
      values: { score: 10 },
    })
  })

  it('keeps failed entries retryable after alias-level partial success', async () => {
    const gateway = new DeterministicAniListGateway([
      { entryId: 1, mediaId: 101, values: {} },
      { entryId: 2, mediaId: 102, values: {} },
    ])
    gateway.enqueue('updateShared', {
      confirmed: [{ entryId: 1, values: { score: 4 } }],
      confirmedDeletedIds: [],
      failures: [
        {
          entryId: 2,
          kind: 'rate-limit',
          message: 'Try later',
          retryable: true,
          execution: 'not-started',
        },
      ],
      unconfirmedIds: [],
      unattemptedIds: [],
    })
    const runner = createBulkEditRunner(gateway)

    const outcome = await runner.start({
      accountId: 9,
      mediaType: 'ANIME',
      entryIds: [1, 2],
      changes: { ...baseChanges(), score: { kind: 'set', value: 4 } },
    }).result

    expect(outcome.status).toBe('partial')
    expect(outcome.confirmedPatches.map((patch) => patch.entryId)).toEqual([1])
    expect(outcome.failures).toMatchObject([{ entryId: 2, retryable: true }])
  })

  it('uses the same outcome lifecycle for confirmed deletes', async () => {
    const gateway = new DeterministicAniListGateway([
      { entryId: 1, mediaId: 101, values: {} },
      { entryId: 2, mediaId: 102, values: {} },
    ])
    const runner = createBulkEditRunner(gateway)

    const outcome = await runner.start({
      operation: 'delete',
      accountId: 9,
      mediaType: 'ANIME',
      entryIds: [1, 2],
    }).result

    expect(outcome.status).toBe('completed')
    expect(outcome.confirmedDeletedIds).toEqual([1, 2])
    expect(gateway.calls.map((call) => call.method)).toEqual(['deleteEntries'])
  })

  it('target-verifies an ambiguous delete as missing', async () => {
    const gateway = new DeterministicAniListGateway()
    gateway.enqueue('deleteEntries', {
      confirmed: [],
      confirmedDeletedIds: [],
      failures: [],
      unconfirmedIds: [1],
      unattemptedIds: [],
    })
    const runner = createBulkEditRunner(gateway)

    const outcome = await runner.start({
      operation: 'delete',
      accountId: 9,
      mediaType: 'MANGA',
      entryIds: [1],
    }).result

    expect(outcome.status).toBe('completed')
    expect(outcome.confirmedDeletedIds).toEqual([1])
    expect(gateway.calls.map((call) => call.method)).toEqual([
      'deleteEntries',
      'readEntries',
    ])
  })

  it('uses the per-entry path only after a known pre-execution validation failure', async () => {
    const gateway = new DeterministicAniListGateway([
      { entryId: 1, mediaId: 101, values: { score: 1 } },
    ])
    gateway.enqueue('updateShared', {
      confirmed: [],
      confirmedDeletedIds: [],
      failures: [
        {
          entryId: 1,
          kind: 'validation',
          message: 'UpdateMediaListEntries is unavailable',
          retryable: false,
          execution: 'not-started',
        },
      ],
      unconfirmedIds: [],
      unattemptedIds: [],
    })
    const runner = createBulkEditRunner(gateway)

    const outcome = await runner.start({
      accountId: 9,
      mediaType: 'ANIME',
      entryIds: [1],
      changes: { ...baseChanges(), score: { kind: 'set', value: 7 } },
    }).result

    expect(outcome.status).toBe('completed')
    expect(gateway.calls.map((call) => call.method)).toEqual([
      'updateShared',
      'readEntries',
      'saveEntries',
    ])
  })

  it('does not reinterpret a fallback preflight read failure as an ambiguous mutation', async () => {
    const gateway = new DeterministicAniListGateway()
    gateway.enqueue('updateShared', {
      confirmed: [],
      confirmedDeletedIds: [],
      failures: [
        {
          entryId: 1,
          kind: 'validation',
          message: 'UpdateMediaListEntries is unavailable',
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
          execution: 'unknown',
        },
      ],
      unconfirmedIds: [],
      unattemptedIds: [],
    })

    const outcome = await createBulkEditRunner(gateway).start({
      accountId: 9,
      mediaType: 'ANIME',
      entryIds: [1],
      changes: { ...baseChanges(), score: { kind: 'set', value: 7 } },
    }).result

    expect(outcome.status).toBe('failed')
    expect(outcome.failures).toMatchObject([
      { entryId: 1, kind: 'network', retryable: true },
    ])
    expect(gateway.calls.map((call) => call.method)).toEqual([
      'updateShared',
      'readEntries',
    ])
  })

  it('target-verifies unknown-execution validation without remutating per entry', async () => {
    const gateway = new DeterministicAniListGateway([
      { entryId: 1, mediaId: 101, values: { score: 1 } },
    ])
    gateway.enqueue('updateShared', {
      confirmed: [],
      confirmedDeletedIds: [],
      failures: [
        {
          entryId: 1,
          kind: 'validation',
          message: 'resolver rejected after execution began',
          retryable: false,
          execution: 'unknown',
        },
      ],
      unconfirmedIds: [],
      unattemptedIds: [],
    })
    gateway.setEntry({ entryId: 1, mediaId: 101, values: { score: 7 } })

    const outcome = await createBulkEditRunner(gateway).start({
      accountId: 9,
      mediaType: 'ANIME',
      entryIds: [1],
      changes: { ...baseChanges(), score: { kind: 'set', value: 7 } },
    }).result

    expect(outcome.status).toBe('completed')
    expect(outcome.confirmedPatches).toMatchObject([
      { entryId: 1, mediaType: 'ANIME', values: { score: 7 } },
    ])
    expect(gateway.calls.map((call) => call.method)).toEqual([
      'updateShared',
      'readEntries',
    ])
  })

  it('target-verifies an unknown-execution deletion failure', async () => {
    const gateway = new DeterministicAniListGateway()
    gateway.enqueue('deleteEntries', {
      confirmed: [],
      confirmedDeletedIds: [],
      failures: [
        {
          entryId: 1,
          kind: 'network',
          message: 'resolver outcome unknown',
          retryable: true,
          execution: 'unknown',
        },
      ],
      unconfirmedIds: [],
      unattemptedIds: [],
    })

    const outcome = await createBulkEditRunner(gateway).start({
      operation: 'delete',
      accountId: 9,
      mediaType: 'ANIME',
      entryIds: [1],
    }).result

    expect(outcome.status).toBe('completed')
    expect(outcome.confirmedDeletedIds).toEqual([1])
    expect(gateway.calls.map((call) => call.method)).toEqual([
      'deleteEntries',
      'readEntries',
    ])
  })

  it('publishes live cumulative progress across gateway chunks', async () => {
    const gateway = new DeterministicAniListGateway(
      Array.from({ length: 51 }, (_, index) => ({
        entryId: index + 1,
        mediaId: index + 101,
        values: {},
      })),
    )
    const handle = createBulkEditRunner(gateway).start({
      accountId: 9,
      mediaType: 'ANIME',
      entryIds: Array.from({ length: 51 }, (_, index) => index + 1),
      changes: { ...baseChanges(), score: { kind: 'set', value: 9 } },
    })
    const progress: BulkJobProgress[] = []
    handle.subscribe((event) => progress.push(event))

    await handle.result

    expect(
      progress
        .filter((event) => event.phase === 'mutating' && event.attempted > 0)
        .map(({ attempted, confirmed, failed, unattempted }) => ({
          attempted,
          confirmed,
          failed,
          unattempted,
        })),
    ).toEqual([
      { attempted: 50, confirmed: 50, failed: 0, unattempted: 1 },
      { attempted: 51, confirmed: 51, failed: 0, unattempted: 0 },
    ])
  })

  it('lets the current mutation settle, starts no later work, and retains remaining IDs', async () => {
    let markStarted!: () => void
    let settle!: () => void
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const gateway = new DeterministicAniListGateway([
      { entryId: 1, mediaId: 101, values: {} },
      { entryId: 2, mediaId: 102, values: {} },
    ])
    gateway.updateShared = async (request) => {
      markStarted()
      await new Promise<void>((resolve) => {
        settle = resolve
      })
      request.onProgress?.({
        total: 2,
        attempted: 1,
        confirmed: 1,
        failed: 0,
        unattempted: 1,
      })
      return {
        confirmed: [{ entryId: 1, values: { score: 9 } }],
        confirmedDeletedIds: [],
        failures: [],
        unconfirmedIds: [],
        unattemptedIds: [2],
      }
    }
    const handle = createBulkEditRunner(gateway).start({
      accountId: 9,
      mediaType: 'ANIME',
      entryIds: [1, 2],
      changes: { ...baseChanges(), score: { kind: 'set', value: 9 } },
    })
    const progress: BulkJobProgress[] = []
    handle.subscribe((event) => progress.push(event))

    await started
    handle.cancel()
    settle()
    const outcome = await handle.result

    expect(outcome.status).toBe('cancelled')
    expect(outcome.confirmedPatches.map((patch) => patch.entryId)).toEqual([1])
    expect(outcome.unattemptedIds).toEqual([2])
    expect(progress).toContainEqual(
      expect.objectContaining({
        phase: 'mutating',
        attempted: 1,
        confirmed: 1,
        failed: 0,
        unattempted: 1,
      }),
    )
  })

  it('returns unknown when targeted verification sees a different value', async () => {
    const gateway = new DeterministicAniListGateway([
      { entryId: 1, mediaId: 101, values: { score: 3 } },
    ])
    gateway.enqueue('updateShared', {
      confirmed: [],
      confirmedDeletedIds: [],
      failures: [],
      unconfirmedIds: [1],
      unattemptedIds: [],
    })
    const outcome = await createBulkEditRunner(gateway).start({
      accountId: 9,
      mediaType: 'ANIME',
      entryIds: [1],
      changes: { ...baseChanges(), score: { kind: 'set', value: 9 } },
    }).result

    expect(outcome.status).toBe('unknown')
    expect(outcome.failures).toMatchObject([{ entryId: 1, kind: 'unknown' }])
  })

  it('does not make an update retryable when its verification read fails', async () => {
    const gateway = new DeterministicAniListGateway()
    gateway.enqueue('updateShared', {
      confirmed: [],
      confirmedDeletedIds: [],
      failures: [],
      unconfirmedIds: [1],
      unattemptedIds: [],
    })
    gateway.enqueue('readEntries', {
      entries: [],
      missingIds: [],
      failures: [
        {
          entryId: 1,
          kind: 'network',
          message: 'verification unavailable',
          retryable: true,
          execution: 'not-started',
        },
      ],
      unconfirmedIds: [],
      unattemptedIds: [],
    })

    const outcome = await createBulkEditRunner(gateway).start({
      accountId: 9,
      mediaType: 'ANIME',
      entryIds: [1],
      changes: { ...baseChanges(), score: { kind: 'set', value: 9 } },
    }).result

    expect(outcome.status).toBe('unknown')
    expect(outcome.failures).toEqual([
      expect.objectContaining({
        entryId: 1,
        kind: 'unknown',
        retryable: false,
      }),
    ])
  })

  it('does not make a deletion retryable when its verification read fails', async () => {
    const gateway = new DeterministicAniListGateway()
    gateway.enqueue('deleteEntries', {
      confirmed: [],
      confirmedDeletedIds: [],
      failures: [],
      unconfirmedIds: [1],
      unattemptedIds: [],
    })
    gateway.enqueue('readEntries', {
      entries: [],
      missingIds: [],
      failures: [
        {
          entryId: 1,
          kind: 'rate-limit',
          message: 'verification throttled',
          retryable: true,
          execution: 'not-started',
        },
      ],
      unconfirmedIds: [],
      unattemptedIds: [],
    })

    const outcome = await createBulkEditRunner(gateway).start({
      operation: 'delete',
      accountId: 9,
      mediaType: 'ANIME',
      entryIds: [1],
    }).result

    expect(outcome.status).toBe('unknown')
    expect(outcome.failures).toEqual([
      expect.objectContaining({
        entryId: 1,
        kind: 'unknown',
        retryable: false,
      }),
    ])
  })

  it('creates missing related seasons through the same job lifecycle', async () => {
    const gateway = new DeterministicAniListGateway()
    const outcome = await createBulkEditRunner(gateway).start({
      operation: 'create',
      accountId: 9,
      mediaType: 'ANIME',
      entries: [
        { mediaId: 101, status: 'COMPLETED', progress: 12 },
        { mediaId: 102, status: 'COMPLETED' },
      ],
    }).result

    expect(outcome.status).toBe('completed')
    expect(outcome.confirmedCreatedEntries).toMatchObject([
      { mediaId: 101, mediaType: 'ANIME', values: { status: 'COMPLETED', progress: 12 } },
      { mediaId: 102, mediaType: 'ANIME', values: { status: 'COMPLETED' } },
    ])
    expect(gateway.calls.map((call) => call.method)).toEqual(['createEntries'])
  })

  it('keeps create partial failures and unattempted media separately retryable', async () => {
    const gateway = new DeterministicAniListGateway()
    gateway.enqueue('createEntries', {
      confirmed: [
        {
          entryId: 11,
          mediaId: 101,
          values: { status: 'COMPLETED', progress: 12 },
        },
      ],
      failures: [
        {
          mediaId: 102,
          kind: 'rate-limit',
          message: 'Try later',
          retryable: true,
          execution: 'not-started',
        },
      ],
      unconfirmedMediaIds: [],
      unattemptedMediaIds: [103],
    })
    const outcome = await createBulkEditRunner(gateway).start({
      operation: 'create',
      accountId: 9,
      mediaType: 'MANGA',
      entries: [
        { mediaId: 101, status: 'COMPLETED', progress: 20 },
        { mediaId: 102, status: 'COMPLETED' },
        { mediaId: 103, status: 'COMPLETED' },
      ],
    }).result

    expect(outcome.status).toBe('partial')
    expect(outcome.confirmedCreatedEntries).toMatchObject([
      { entryId: 11, mediaId: 101, mediaType: 'MANGA' },
    ])
    expect(outcome.creationFailures).toMatchObject([
      { mediaId: 102, kind: 'rate-limit', retryable: true },
    ])
    expect(outcome.unattemptedMediaIds).toEqual([103])
  })

  it('target-verifies an omitted creation response without loading a collection', async () => {
    const gateway = new DeterministicAniListGateway([
      {
        entryId: 11,
        mediaId: 101,
        values: { status: 'COMPLETED', progress: 12 },
      },
    ])
    gateway.enqueue('createEntries', {
      confirmed: [],
      failures: [],
      unconfirmedMediaIds: [101],
      unattemptedMediaIds: [],
    })
    const outcome = await createBulkEditRunner(gateway).start({
      operation: 'create',
      accountId: 9,
      mediaType: 'ANIME',
      entries: [{ mediaId: 101, status: 'COMPLETED', progress: 12 }],
    }).result

    expect(outcome.status).toBe('completed')
    expect(outcome.confirmedCreatedEntries).toMatchObject([
      { entryId: 11, mediaId: 101 },
    ])
    expect(gateway.calls.map((call) => call.method)).toEqual([
      'createEntries',
      'readEntriesByMediaIds',
    ])
    expect(gateway.calls.map((call) => call.method)).not.toContain(
      'loadMediaListCollection',
    )
  })

  it('target-verifies an unknown-execution creation failure', async () => {
    const gateway = new DeterministicAniListGateway([
      {
        entryId: 11,
        mediaId: 101,
        values: { status: 'COMPLETED', progress: 12 },
      },
    ])
    gateway.enqueue('createEntries', {
      confirmed: [],
      failures: [
        {
          mediaId: 101,
          kind: 'validation',
          message: 'resolver outcome unknown',
          retryable: false,
          execution: 'unknown',
        },
      ],
      unconfirmedMediaIds: [],
      unattemptedMediaIds: [],
    })

    const outcome = await createBulkEditRunner(gateway).start({
      operation: 'create',
      accountId: 9,
      mediaType: 'ANIME',
      entries: [{ mediaId: 101, status: 'COMPLETED', progress: 12 }],
    }).result

    expect(outcome.status).toBe('completed')
    expect(outcome.confirmedCreatedEntries).toMatchObject([
      { entryId: 11, mediaId: 101 },
    ])
    expect(gateway.calls.map((call) => call.method)).toEqual([
      'createEntries',
      'readEntriesByMediaIds',
    ])
  })

  it('returns an unknown create outcome when targeted verification differs', async () => {
    const gateway = new DeterministicAniListGateway([
      { entryId: 11, mediaId: 101, values: { status: 'CURRENT', progress: 1 } },
    ])
    gateway.enqueue('createEntries', {
      confirmed: [],
      failures: [],
      unconfirmedMediaIds: [101],
      unattemptedMediaIds: [],
    })
    const outcome = await createBulkEditRunner(gateway).start({
      operation: 'create',
      accountId: 9,
      mediaType: 'ANIME',
      entries: [{ mediaId: 101, status: 'COMPLETED', progress: 12 }],
    }).result

    expect(outcome.status).toBe('unknown')
    expect(outcome.creationFailures).toMatchObject([
      { mediaId: 101, kind: 'unknown' },
    ])
  })

  it('keeps a failed creation verification unknown while carrying confirmed authentication', async () => {
    const gateway = new DeterministicAniListGateway()
    gateway.enqueue('createEntries', {
      confirmed: [],
      failures: [],
      unconfirmedMediaIds: [101],
      unattemptedMediaIds: [],
    })
    gateway.enqueue('readEntriesByMediaIds', {
      entries: [],
      missingMediaIds: [],
      failures: [
        {
          mediaId: 101,
          kind: 'authentication',
          message: 'invalid token',
          retryable: false,
          execution: 'not-started',
        },
      ],
      unconfirmedMediaIds: [],
      unattemptedMediaIds: [],
    })

    const outcome = await createBulkEditRunner(gateway).start({
      operation: 'create',
      accountId: 9,
      mediaType: 'ANIME',
      entries: [{ mediaId: 101, status: 'COMPLETED' }],
    }).result

    expect(outcome.status).toBe('unknown')
    expect(outcome.creationFailures).toEqual([
      expect.objectContaining({
        mediaId: 101,
        kind: 'unknown',
        retryable: false,
        authenticationConfirmed: true,
      }),
    ])
  })

  it('lets an in-flight create settle and cancels the remaining media', async () => {
    let markStarted!: () => void
    let settle!: () => void
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const gateway = new DeterministicAniListGateway()
    gateway.createEntries = async () => {
      markStarted()
      await new Promise<void>((resolve) => {
        settle = resolve
      })
      return {
        confirmed: [
          { entryId: 11, mediaId: 101, values: { status: 'COMPLETED' } },
        ],
        failures: [],
        unconfirmedMediaIds: [],
        unattemptedMediaIds: [102],
      }
    }
    const handle = createBulkEditRunner(gateway).start({
      operation: 'create',
      accountId: 9,
      mediaType: 'ANIME',
      entries: [
        { mediaId: 101, status: 'COMPLETED' },
        { mediaId: 102, status: 'COMPLETED' },
      ],
    })

    await started
    handle.cancel()
    settle()
    const outcome = await handle.result

    expect(outcome.status).toBe('cancelled')
    expect(outcome.confirmedCreatedEntries).toHaveLength(1)
    expect(outcome.unattemptedMediaIds).toEqual([102])
  })
})
