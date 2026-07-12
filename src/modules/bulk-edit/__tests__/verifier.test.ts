import { describe, expect, it } from 'vitest'

import { DeterministicAniListGateway } from '@/modules/anilist'
import {
  combineBulkJobOutcomes,
  hasAmbiguousResults,
  retryableEntryIds,
  retryableMediaIds,
  verifyAmbiguousResults,
  type BulkChanges,
  type BulkJobOutcome,
} from '..'

const unchanged = () => ({ kind: 'unchanged' as const })

const changes = (score = 8): BulkChanges => ({
  status: unchanged(),
  score: { kind: 'set', value: score },
  progress: unchanged(),
  private: unchanged(),
  hiddenFromStatusLists: unchanged(),
  notes: unchanged(),
  customLists: {},
})

const stats = new DeterministicAniListGateway().getRateLimitStats()

const ambiguousOutcome = (entryId: number): BulkJobOutcome => ({
  status: 'cancelled',
  confirmedPatches: [],
  confirmedDeletedIds: [],
  failures: [
    {
      entryId,
      kind: 'unknown',
      message: 'The mutation may have completed.',
      retryable: false,
    },
  ],
  unattemptedIds: [2],
  stats,
})

const uncertainEntriesOutcome = (
  entryIds: readonly number[],
  overrides: Partial<BulkJobOutcome> = {},
): BulkJobOutcome => ({
  status: 'unknown',
  confirmedPatches: [],
  confirmedDeletedIds: [],
  failures: entryIds.map((entryId) => ({
    entryId,
    kind: 'unknown',
    message: 'The mutation may have completed.',
    retryable: true,
  })),
  unattemptedIds: [],
  stats,
  ...overrides,
})

const uncertainCreationsOutcome = (
  mediaIds: readonly number[],
  overrides: Partial<BulkJobOutcome> = {},
): BulkJobOutcome => ({
  status: 'unknown',
  confirmedPatches: [],
  confirmedDeletedIds: [],
  failures: [],
  creationFailures: mediaIds.map((mediaId) => ({
    mediaId,
    kind: 'unknown',
    message: 'The creation may have completed.',
    retryable: true,
  })),
  unattemptedIds: [],
  unattemptedMediaIds: [],
  stats,
  ...overrides,
})

describe('targeted bulk outcome verification', () => {
  it('confirms only the ambiguous update and preserves unattempted work', async () => {
    const gateway = new DeterministicAniListGateway([
      { entryId: 1, mediaId: 101, values: { score: 8 } },
    ])
    const outcome = await verifyAmbiguousResults(
      gateway,
      [
        {
          accountId: 7,
          mediaType: 'ANIME',
          entryIds: [1, 2],
          changes: changes(),
        },
      ],
      ambiguousOutcome(1),
    )

    expect(outcome.status).toBe('partial')
    expect(outcome.confirmedPatches).toMatchObject([
      { entryId: 1, mediaType: 'ANIME', values: { score: 8 } },
    ])
    expect(outcome.unattemptedIds).toEqual([2])
    expect(outcome.failures).toEqual([])
    expect(gateway.calls.map((call) => call.method)).toEqual(['readEntries'])
  })

  it('turns a positively observed mismatch into a safe retry', async () => {
    const gateway = new DeterministicAniListGateway([
      { entryId: 1, mediaId: 101, values: { score: 3 } },
    ])
    const outcome = await verifyAmbiguousResults(
      gateway,
      [
        {
          accountId: 7,
          mediaType: 'ANIME',
          entryIds: [1],
          changes: changes(),
        },
      ],
      { ...ambiguousOutcome(1), unattemptedIds: [] },
    )

    expect(hasAmbiguousResults(outcome)).toBe(false)
    expect(outcome.failures).toMatchObject([
      { entryId: 1, kind: 'validation', retryable: true },
    ])
    expect(retryableEntryIds(outcome)).toEqual([1])
  })

  it('keeps mutation state ambiguous when verification reads fail', async () => {
    const gateway = new DeterministicAniListGateway()
    gateway.enqueue('readEntries', {
      entries: [],
      missingIds: [],
      failures: [
        {
          entryId: 1,
          kind: 'authentication',
          message: 'Token expired.',
          retryable: false,
          execution: 'not-started',
        },
      ],
      unconfirmedIds: [],
      unattemptedIds: [],
    })
    const outcome = await verifyAmbiguousResults(
      gateway,
      [
        {
          operation: 'delete',
          accountId: 7,
          mediaType: 'MANGA',
          entryIds: [1],
        },
      ],
      { ...ambiguousOutcome(1), unattemptedIds: [] },
    )

    expect(hasAmbiguousResults(outcome)).toBe(true)
    expect(outcome.failures).toMatchObject([
      {
        entryId: 1,
        kind: 'unknown',
        authenticationConfirmed: true,
      },
    ])
    expect(retryableEntryIds(outcome)).toEqual([])
  })

  it('verifies uncertain deletes and related-entry creations without mutation', async () => {
    const gateway = new DeterministicAniListGateway([
      {
        entryId: 11,
        mediaId: 101,
        values: { status: 'COMPLETED', progress: 12 },
      },
    ])
    const prior: BulkJobOutcome = {
      status: 'cancelled',
      confirmedPatches: [],
      confirmedDeletedIds: [],
      failures: [
        { entryId: 9, kind: 'unknown', message: 'uncertain', retryable: false },
      ],
      creationFailures: [
        { mediaId: 101, kind: 'unknown', message: 'uncertain', retryable: false },
      ],
      unattemptedIds: [],
      unattemptedMediaIds: [],
      stats,
    }
    const outcome = await verifyAmbiguousResults(
      gateway,
      [
        {
          operation: 'delete',
          accountId: 7,
          mediaType: 'ANIME',
          entryIds: [9],
        },
        {
          operation: 'create',
          accountId: 7,
          mediaType: 'ANIME',
          entries: [{ mediaId: 101, status: 'COMPLETED', progress: 12 }],
        },
      ],
      prior,
    )

    expect(outcome.status).toBe('completed')
    expect(outcome.confirmedDeletedIds).toEqual([9])
    expect(outcome.confirmedCreatedEntries).toMatchObject([
      { entryId: 11, mediaId: 101, mediaType: 'ANIME' },
    ])
    expect(gateway.calls.every((call) => call.method.startsWith('read'))).toBe(true)
  })

  it('combines cancelled and ambiguous outcomes without making retry unsafe', () => {
    const combined = combineBulkJobOutcomes(
      [
        ambiguousOutcome(1),
        {
          status: 'partial',
          confirmedPatches: [
            { entryId: 3, mediaType: 'ANIME', values: { score: 8 } },
          ],
          confirmedDeletedIds: [],
          failures: [],
          unattemptedIds: [],
          stats,
        },
      ],
      stats,
    )

    expect(combined.status).toBe('cancelled')
    expect(hasAmbiguousResults(combined)).toBe(true)
  })

  it('checks every requested update field before confirming an ambiguous update', async () => {
    const expected: BulkChanges = {
      status: { kind: 'set', value: 'COMPLETED' },
      score: { kind: 'set', value: 8 },
      progress: { kind: 'set', value: 12 },
      private: { kind: 'set', value: true },
      hiddenFromStatusLists: { kind: 'set', value: false },
      notes: { kind: 'set', value: '' },
      customLists: { untouched: 'keep', included: 'add', excluded: 'remove' },
    }
    const matchingValues = {
      status: 'COMPLETED' as const,
      score: 8,
      progress: 12,
      private: true,
      hiddenFromStatusLists: false,
      notes: undefined,
      customLists: { included: true, excluded: false },
    }
    const gateway = new DeterministicAniListGateway([
      { entryId: 1, mediaId: 101, values: matchingValues, updatedAt: 10 },
      {
        entryId: 2,
        mediaId: 102,
        values: { ...matchingValues, status: 'CURRENT' },
      },
      { entryId: 3, mediaId: 103, values: { ...matchingValues, score: 3 } },
      { entryId: 4, mediaId: 104, values: { ...matchingValues, progress: 1 } },
      { entryId: 5, mediaId: 105, values: { ...matchingValues, private: false } },
      {
        entryId: 6,
        mediaId: 106,
        values: { ...matchingValues, hiddenFromStatusLists: true },
      },
      { entryId: 7, mediaId: 107, values: { ...matchingValues, notes: 'old' } },
      {
        entryId: 8,
        mediaId: 108,
        values: { ...matchingValues, customLists: { excluded: false } },
      },
      {
        entryId: 9,
        mediaId: 109,
        values: {
          ...matchingValues,
          customLists: { included: true, excluded: true },
        },
      },
    ])

    const outcome = await verifyAmbiguousResults(
      gateway,
      [
        {
          accountId: 7,
          mediaType: 'ANIME',
          entryIds: [1, 2, 3, 4, 5, 6, 7, 8, 9],
          changes: expected,
        },
      ],
      uncertainEntriesOutcome([1, 2, 3, 4, 5, 6, 7, 8, 9]),
    )

    expect(outcome.status).toBe('partial')
    expect(outcome.confirmedPatches).toEqual([
      {
        entryId: 1,
        mediaType: 'ANIME',
        values: matchingValues,
        updatedAt: 10,
      },
    ])
    expect(outcome.failures).toHaveLength(8)
    expect(outcome.failures).toEqual(
      expect.arrayContaining(
        [2, 3, 4, 5, 6, 7, 8, 9].map((entryId) =>
          expect.objectContaining({ entryId, kind: 'validation', retryable: true }),
        ),
      ),
    )
    expect(retryableEntryIds(outcome)).toEqual([2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('classifies every targeted read result and retains known and unattempted work', async () => {
    const gateway = new DeterministicAniListGateway()
    gateway.enqueue('readEntries', {
      entries: [
        { entryId: 1, mediaId: 101, values: { score: 8 }, updatedAt: 20 },
        { entryId: 2, mediaId: 102, values: { score: 4 } },
      ],
      missingIds: [3],
      failures: [
        {
          entryId: 4,
          kind: 'network',
          message: 'Offline.',
          retryable: true,
          execution: 'not-started',
        },
        {
          entryId: 5,
          kind: 'authentication',
          message: 'Token expired.',
          retryable: false,
          execution: 'not-started',
        },
      ],
      unconfirmedIds: [6],
      unattemptedIds: [7],
    })
    const prior = uncertainEntriesOutcome([1, 2, 3, 4, 5, 6, 7], {
      failures: [
        ...uncertainEntriesOutcome([1, 2, 3, 4, 5, 6, 7]).failures,
        {
          entryId: 8,
          kind: 'rate-limit',
          message: 'Wait before retrying.',
          retryable: true,
        },
      ],
      unattemptedIds: [9],
    })

    const outcome = await verifyAmbiguousResults(
      gateway,
      [
        {
          accountId: 7,
          mediaType: 'ANIME',
          entryIds: [1, 2, 3, 4, 5, 6, 7],
          changes: changes(),
        },
        {
          operation: 'delete',
          accountId: 7,
          mediaType: 'ANIME',
          entryIds: [999],
        },
      ],
      prior,
    )

    expect(outcome.status).toBe('unknown')
    expect(outcome.confirmedPatches).toMatchObject([
      { entryId: 1, mediaType: 'ANIME', updatedAt: 20 },
    ])
    expect(outcome.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entryId: 2, kind: 'validation', retryable: true }),
        expect.objectContaining({ entryId: 3, kind: 'validation', retryable: false }),
        expect.objectContaining({ entryId: 4, kind: 'unknown' }),
        expect.objectContaining({
          entryId: 5,
          kind: 'unknown',
          authenticationConfirmed: true,
        }),
        expect.objectContaining({ entryId: 6, kind: 'unknown' }),
        expect.objectContaining({ entryId: 7, kind: 'unknown' }),
        expect.objectContaining({ entryId: 8, kind: 'rate-limit' }),
      ]),
    )
    expect(outcome.unattemptedIds).toEqual([9])
    expect(retryableEntryIds(outcome)).toEqual([8, 2, 9])
    expect(gateway.calls.map((call) => call.method)).toEqual(['readEntries'])
  })

  it('treats an observed delete target as safely retryable', async () => {
    const gateway = new DeterministicAniListGateway([
      { entryId: 1, mediaId: 101, values: { status: 'CURRENT' } },
    ])
    const outcome = await verifyAmbiguousResults(
      gateway,
      [
        {
          operation: 'delete',
          accountId: 7,
          mediaType: 'MANGA',
          entryIds: [1],
        },
      ],
      uncertainEntriesOutcome([1]),
    )

    expect(outcome.status).toBe('failed')
    expect(outcome.confirmedDeletedIds).toEqual([])
    expect(outcome.failures).toMatchObject([
      { entryId: 1, kind: 'validation', retryable: true },
    ])
    expect(retryableEntryIds(outcome)).toEqual([1])
  })

  it('classifies matching, mismatching, missing, and unresolved creation reads', async () => {
    const gateway = new DeterministicAniListGateway()
    gateway.enqueue('readEntriesByMediaIds', {
      entries: [
        {
          entryId: 11,
          mediaId: 101,
          values: { status: 'COMPLETED', progress: 99 },
          updatedAt: 30,
        },
        {
          entryId: 12,
          mediaId: 102,
          values: { status: 'CURRENT', progress: 12 },
        },
        {
          entryId: 13,
          mediaId: 103,
          values: { status: 'COMPLETED', progress: 3 },
        },
      ],
      missingMediaIds: [104],
      failures: [
        {
          mediaId: 105,
          kind: 'network',
          message: 'Offline.',
          retryable: true,
          execution: 'not-started',
        },
        {
          mediaId: 106,
          kind: 'authentication',
          message: 'Token expired.',
          retryable: false,
          execution: 'not-started',
        },
      ],
      unconfirmedMediaIds: [107],
      unattemptedMediaIds: [108],
    })
    const prior = uncertainCreationsOutcome(
      [101, 102, 103, 104, 105, 106, 107, 108],
      {
        creationFailures: [
          ...uncertainCreationsOutcome([
            101, 102, 103, 104, 105, 106, 107, 108,
          ]).creationFailures!,
          {
            mediaId: 109,
            kind: 'validation',
            message: 'Known validation failure.',
            retryable: false,
          },
        ],
        unattemptedMediaIds: [110],
      },
    )

    const outcome = await verifyAmbiguousResults(
      gateway,
      [
        {
          operation: 'create',
          accountId: 7,
          mediaType: 'ANIME',
          entries: [
            { mediaId: 101, status: 'COMPLETED' },
            { mediaId: 102, status: 'COMPLETED', progress: 12 },
            { mediaId: 103, status: 'COMPLETED', progress: 12 },
            { mediaId: 104, status: 'COMPLETED' },
            { mediaId: 105, status: 'COMPLETED' },
            { mediaId: 106, status: 'COMPLETED' },
            { mediaId: 107, status: 'COMPLETED' },
            { mediaId: 108, status: 'COMPLETED' },
          ],
        },
        {
          operation: 'create',
          accountId: 7,
          mediaType: 'ANIME',
          entries: [{ mediaId: 999, status: 'COMPLETED' }],
        },
      ],
      prior,
    )

    expect(outcome.status).toBe('unknown')
    expect(outcome.confirmedCreatedEntries).toEqual([
      {
        entryId: 11,
        mediaId: 101,
        mediaType: 'ANIME',
        values: { status: 'COMPLETED', progress: 99 },
        updatedAt: 30,
      },
    ])
    expect(outcome.creationFailures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mediaId: 102, kind: 'validation', retryable: true }),
        expect.objectContaining({ mediaId: 103, kind: 'validation', retryable: true }),
        expect.objectContaining({ mediaId: 104, kind: 'validation', retryable: true }),
        expect.objectContaining({ mediaId: 105, kind: 'unknown' }),
        expect.objectContaining({
          mediaId: 106,
          kind: 'unknown',
          authenticationConfirmed: true,
        }),
        expect.objectContaining({ mediaId: 107, kind: 'unknown' }),
        expect.objectContaining({ mediaId: 108, kind: 'unknown' }),
        expect.objectContaining({ mediaId: 109, kind: 'validation', retryable: false }),
      ]),
    )
    expect(outcome.unattemptedMediaIds).toEqual([110])
    expect(retryableMediaIds(outcome)).toEqual([102, 103, 104, 110])
    expect(gateway.calls.map((call) => call.method)).toEqual([
      'readEntriesByMediaIds',
    ])
  })

  it('leaves ambiguous targets without a matching command unsafe to retry', async () => {
    const gateway = new DeterministicAniListGateway()
    const outcome = await verifyAmbiguousResults(
      gateway,
      [],
      uncertainEntriesOutcome([1], {
        creationFailures: uncertainCreationsOutcome([101]).creationFailures,
      }),
    )

    expect(outcome.status).toBe('unknown')
    expect(outcome.failures).toMatchObject([
      { entryId: 1, kind: 'unknown', retryable: true },
    ])
    expect(outcome.creationFailures).toMatchObject([
      { mediaId: 101, kind: 'unknown', retryable: true },
    ])
    expect(retryableEntryIds(outcome)).toEqual([])
    expect(retryableMediaIds(outcome)).toEqual([])
    expect(gateway.calls).toEqual([])
  })

  it('deduplicates only known-safe retries and excludes every ambiguous result', () => {
    const outcome: BulkJobOutcome = {
      status: 'unknown',
      confirmedPatches: [],
      confirmedDeletedIds: [],
      failures: [
        { entryId: 1, kind: 'network', message: 'Retry.', retryable: true },
        { entryId: 1, kind: 'rate-limit', message: 'Retry.', retryable: true },
        { entryId: 2, kind: 'unknown', message: 'Verify.', retryable: true },
        { entryId: 3, kind: 'validation', message: 'Stop.', retryable: false },
      ],
      creationFailures: [
        { mediaId: 101, kind: 'network', message: 'Retry.', retryable: true },
        { mediaId: 101, kind: 'rate-limit', message: 'Retry.', retryable: true },
        { mediaId: 102, kind: 'unknown', message: 'Verify.', retryable: true },
        { mediaId: 103, kind: 'validation', message: 'Stop.', retryable: false },
      ],
      unattemptedIds: [1, 4, 4],
      unattemptedMediaIds: [101, 104, 104],
      stats,
    }

    expect(retryableEntryIds(outcome)).toEqual([1, 4])
    expect(retryableMediaIds(outcome)).toEqual([101, 104])
    expect(hasAmbiguousResults(outcome)).toBe(true)
    expect(
      hasAmbiguousResults({
        ...outcome,
        failures: [],
        creationFailures: [],
      }),
    ).toBe(false)
    expect(retryableMediaIds({ ...outcome, creationFailures: undefined })).toEqual([
      101,
      104,
    ])
  })

  it.each([
    {
      name: 'completed',
      first: {
        status: 'completed' as const,
        confirmedPatches: [
          { entryId: 1, mediaType: 'ANIME' as const, values: { score: 8 } },
        ],
        confirmedDeletedIds: [],
        failures: [],
        unattemptedIds: [],
        stats,
      },
      expected: 'completed',
    },
    {
      name: 'partial',
      first: {
        status: 'partial' as const,
        confirmedPatches: [],
        confirmedDeletedIds: [1],
        failures: [
          {
            entryId: 2,
            kind: 'network' as const,
            message: 'Retry.',
            retryable: true,
          },
        ],
        unattemptedIds: [],
        stats,
      },
      expected: 'partial',
    },
    {
      name: 'failed',
      first: {
        status: 'failed' as const,
        confirmedPatches: [],
        confirmedDeletedIds: [],
        failures: [],
        unattemptedIds: [2],
        stats,
      },
      expected: 'failed',
    },
    {
      name: 'unknown from a creation only',
      first: uncertainCreationsOutcome([101]),
      expected: 'unknown',
    },
  ])('combines outcomes into $name status', ({ first, expected }) => {
    const combined = combineBulkJobOutcomes([first], stats)

    expect(combined.status).toBe(expected)
  })

  it('aggregates every outcome collection while tolerating omitted create fields', () => {
    const combined = combineBulkJobOutcomes(
      [
        {
          status: 'partial',
          confirmedPatches: [
            { entryId: 1, mediaType: 'ANIME', values: { score: 8 } },
          ],
          confirmedDeletedIds: [2],
          confirmedCreatedEntries: [
            {
              entryId: 3,
              mediaId: 103,
              mediaType: 'ANIME',
              values: { status: 'COMPLETED' },
            },
          ],
          failures: [],
          creationFailures: [],
          unattemptedIds: [],
          unattemptedMediaIds: [],
          stats,
        },
        {
          status: 'failed',
          confirmedPatches: [],
          confirmedDeletedIds: [],
          failures: [],
          unattemptedIds: [4],
          stats,
        },
      ],
      stats,
    )

    expect(combined.status).toBe('partial')
    expect(combined.confirmedPatches).toHaveLength(1)
    expect(combined.confirmedDeletedIds).toEqual([2])
    expect(combined.confirmedCreatedEntries).toHaveLength(1)
    expect(combined.unattemptedIds).toEqual([4])
    expect(combined.unattemptedMediaIds).toEqual([])
  })
})
