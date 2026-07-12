import type {
  AniListGateway,
  GatewayCreatedEntry,
  GatewayEntrySnapshot,
} from '../anilist'
import type {
  BulkChanges,
  BulkJobOutcome,
  BulkRunnerCommand,
  ConfirmedCreatedEntry,
  ConfirmedEntryPatch,
  CreationFailure,
  EntryFailure,
  FieldEdit,
} from './types'

const fieldMatches = <T>(
  edit: FieldEdit<T>,
  actual: T | null | undefined,
): boolean => edit.kind === 'unchanged' || Object.is(edit.value, actual)

const updateMatches = (
  snapshot: GatewayEntrySnapshot,
  changes: BulkChanges,
): boolean => {
  if (!fieldMatches(changes.status, snapshot.values.status)) return false
  if (!fieldMatches(changes.score, snapshot.values.score)) return false
  if (!fieldMatches(changes.progress, snapshot.values.progress)) return false
  if (!fieldMatches(changes.private, snapshot.values.private)) return false
  if (
    !fieldMatches(
      changes.hiddenFromStatusLists,
      snapshot.values.hiddenFromStatusLists,
    )
  ) {
    return false
  }
  if (
    changes.notes.kind === 'set' &&
    (snapshot.values.notes ?? '') !== changes.notes.value
  ) {
    return false
  }
  return Object.entries(changes.customLists).every(([name, intent]) => {
    if (intent === 'keep') return true
    const present = snapshot.values.customLists?.[name] === true
    return intent === 'add' ? present : !present
  })
}

const creationMatches = (
  entry: GatewayCreatedEntry,
  expected: { status: string; progress?: number },
): boolean =>
  entry.values.status === expected.status &&
  (expected.progress === undefined || entry.values.progress === expected.progress)

const verifiedRetryableFailure = (
  entryId: number,
  message: string,
): EntryFailure => ({
  entryId,
  kind: 'validation',
  message,
  retryable: true,
})

const verifiedRetryableCreationFailure = (
  mediaId: number,
  message: string,
): CreationFailure => ({
  mediaId,
  kind: 'validation',
  message,
  retryable: true,
})

const stillUncertain = (
  entryId: number,
  message: string,
  authenticationConfirmed = false,
): EntryFailure => ({
  entryId,
  kind: 'unknown',
  message,
  retryable: true,
  ...(authenticationConfirmed ? { authenticationConfirmed: true } : {}),
})

const stillUncertainCreation = (
  mediaId: number,
  message: string,
  authenticationConfirmed = false,
): CreationFailure => ({
  mediaId,
  kind: 'unknown',
  message,
  retryable: true,
  ...(authenticationConfirmed ? { authenticationConfirmed: true } : {}),
})

export const hasAmbiguousResults = (outcome: BulkJobOutcome): boolean =>
  outcome.failures.some((failure) => failure.kind === 'unknown') ||
  (outcome.creationFailures ?? []).some(
    (failure) => failure.kind === 'unknown',
  )

export const retryableEntryIds = (outcome: BulkJobOutcome): readonly number[] =>
  [
    ...outcome.failures
      .filter((failure) => failure.kind !== 'unknown' && failure.retryable)
      .map((failure) => failure.entryId),
    ...outcome.unattemptedIds,
  ].filter((entryId, index, values) => values.indexOf(entryId) === index)

export const retryableMediaIds = (outcome: BulkJobOutcome): readonly number[] =>
  [
    ...(outcome.creationFailures ?? [])
      .filter((failure) => failure.kind !== 'unknown' && failure.retryable)
      .map((failure) => failure.mediaId),
    ...(outcome.unattemptedMediaIds ?? []),
  ].filter((mediaId, index, values) => values.indexOf(mediaId) === index)

export function combineBulkJobOutcomes(
  outcomes: readonly BulkJobOutcome[],
  stats: BulkJobOutcome['stats'],
): BulkJobOutcome {
  const confirmedPatches = outcomes.flatMap((outcome) => outcome.confirmedPatches)
  const confirmedDeletedIds = outcomes.flatMap(
    (outcome) => outcome.confirmedDeletedIds,
  )
  const confirmedCreatedEntries = outcomes.flatMap(
    (outcome) => outcome.confirmedCreatedEntries ?? [],
  )
  const failures = outcomes.flatMap((outcome) => outcome.failures)
  const creationFailures = outcomes.flatMap(
    (outcome) => outcome.creationFailures ?? [],
  )
  const unattemptedIds = outcomes.flatMap((outcome) => outcome.unattemptedIds)
  const unattemptedMediaIds = outcomes.flatMap(
    (outcome) => outcome.unattemptedMediaIds ?? [],
  )
  const successes =
    confirmedPatches.length +
    confirmedDeletedIds.length +
    confirmedCreatedEntries.length
  const remaining =
    failures.length +
    creationFailures.length +
    unattemptedIds.length +
    unattemptedMediaIds.length
  const status: BulkJobOutcome['status'] = outcomes.some(
    (outcome) => outcome.status === 'cancelled',
  )
    ? 'cancelled'
    : hasAmbiguousResults({
          status: 'unknown',
          confirmedPatches: [],
          confirmedDeletedIds: [],
          failures,
          creationFailures,
          unattemptedIds: [],
          stats,
        })
      ? 'unknown'
      : remaining === 0
        ? 'completed'
        : successes > 0
          ? 'partial'
          : 'failed'

  return {
    status,
    confirmedPatches,
    confirmedDeletedIds,
    confirmedCreatedEntries,
    failures,
    creationFailures,
    unattemptedIds,
    unattemptedMediaIds,
    stats,
  }
}

function terminalStatus(
  successes: number,
  failures: readonly EntryFailure[],
  creationFailures: readonly CreationFailure[],
  unattemptedIds: readonly number[],
  unattemptedMediaIds: readonly number[],
): BulkJobOutcome['status'] {
  if (
    failures.some((failure) => failure.kind === 'unknown') ||
    creationFailures.some((failure) => failure.kind === 'unknown')
  ) {
    return 'unknown'
  }
  const remaining =
    failures.length +
    creationFailures.length +
    unattemptedIds.length +
    unattemptedMediaIds.length
  if (remaining === 0) return 'completed'
  return successes > 0 ? 'partial' : 'failed'
}

/**
 * Verifies only ambiguous attempted mutations. Known failures and unattempted
 * targets remain available for a separate, safe retry action.
 */
export async function verifyAmbiguousResults(
  gateway: AniListGateway,
  commands: readonly BulkRunnerCommand[],
  prior: BulkJobOutcome,
  signal?: AbortSignal,
): Promise<BulkJobOutcome> {
  const uncertainEntryIds = new Set(
    prior.failures
      .filter((failure) => failure.kind === 'unknown')
      .map((failure) => failure.entryId),
  )
  const uncertainMediaIds = new Set(
    (prior.creationFailures ?? [])
      .filter((failure) => failure.kind === 'unknown')
      .map((failure) => failure.mediaId),
  )
  const failures: EntryFailure[] = prior.failures.filter(
    (failure) => failure.kind !== 'unknown',
  )
  const creationFailures: CreationFailure[] = (
    prior.creationFailures ?? []
  ).filter((failure) => failure.kind !== 'unknown')
  const unattemptedIds = new Set(prior.unattemptedIds)
  const unattemptedMediaIds = new Set(prior.unattemptedMediaIds ?? [])
  const confirmedPatches: ConfirmedEntryPatch[] = []
  const confirmedDeletedIds: number[] = []
  const confirmedCreatedEntries: ConfirmedCreatedEntry[] = []
  const accountedEntryIds = new Set<number>()
  const accountedMediaIds = new Set<number>()

  for (const command of commands) {
    if (command.operation === 'create') {
      const entries = command.entries.filter((entry) =>
        uncertainMediaIds.has(entry.mediaId),
      )
      if (entries.length === 0) continue
      const result = await gateway.readEntriesByMediaIds({
        accountId: command.accountId,
        mediaIds: entries.map((entry) => entry.mediaId),
        signal,
      })
      const expected = new Map(entries.map((entry) => [entry.mediaId, entry]))
      result.entries.forEach((entry) => {
        accountedMediaIds.add(entry.mediaId)
        const requested = expected.get(entry.mediaId)
        if (requested && creationMatches(entry, requested)) {
          confirmedCreatedEntries.push({
            entryId: entry.entryId,
            mediaId: entry.mediaId,
            mediaType: command.mediaType,
            values: entry.values,
            ...(entry.updatedAt === undefined
              ? {}
              : { updatedAt: entry.updatedAt }),
          })
        } else {
          creationFailures.push(
            verifiedRetryableCreationFailure(
              entry.mediaId,
              'The entry exists but does not match the requested completion values; retrying is now safe.',
            ),
          )
        }
      })
      result.missingMediaIds.forEach((mediaId) => {
        accountedMediaIds.add(mediaId)
        creationFailures.push(
          verifiedRetryableCreationFailure(
            mediaId,
            'The entry is confirmed absent; retrying its creation is now safe.',
          ),
        )
      })
      result.failures.forEach((failure) => {
        accountedMediaIds.add(failure.mediaId)
        creationFailures.push(
          stillUncertainCreation(
            failure.mediaId,
            `Verification could not resolve this creation: ${failure.message}`,
            failure.kind === 'authentication',
          ),
        )
      })
      result.unconfirmedMediaIds.forEach((mediaId) => {
        accountedMediaIds.add(mediaId)
        creationFailures.push(
          stillUncertainCreation(
            mediaId,
            'AniList still did not return this entry during targeted verification.',
          ),
        )
      })
      result.unattemptedMediaIds.forEach((mediaId) => {
        accountedMediaIds.add(mediaId)
        creationFailures.push(
          stillUncertainCreation(
            mediaId,
            'Targeted verification did not reach this uncertain creation.',
          ),
        )
      })
      continue
    }

    const entryIds = command.entryIds.filter((entryId) =>
      uncertainEntryIds.has(entryId),
    )
    if (entryIds.length === 0) continue
    const result = await gateway.readEntries({
      accountId: command.accountId,
      entryIds,
      signal,
    })
    result.entries.forEach((entry) => {
      accountedEntryIds.add(entry.entryId)
      if (command.operation === 'delete') {
        failures.push(
          verifiedRetryableFailure(
            entry.entryId,
            'The entry still exists; retrying its deletion is now safe.',
          ),
        )
      } else if (updateMatches(entry, command.changes)) {
        confirmedPatches.push({
          entryId: entry.entryId,
          mediaType: command.mediaType,
          values: entry.values,
          ...(entry.updatedAt === undefined ? {} : { updatedAt: entry.updatedAt }),
        })
      } else {
        failures.push(
          verifiedRetryableFailure(
            entry.entryId,
            'AniList does not match the requested values; retrying is now safe.',
          ),
        )
      }
    })
    result.missingIds.forEach((entryId) => {
      accountedEntryIds.add(entryId)
      if (command.operation === 'delete') {
        confirmedDeletedIds.push(entryId)
      } else {
        failures.push({
          entryId,
          kind: 'validation',
          message: 'The media-list entry no longer exists on AniList.',
          retryable: false,
        })
      }
    })
    result.failures.forEach((failure) => {
      accountedEntryIds.add(failure.entryId)
      failures.push(
        stillUncertain(
          failure.entryId,
          `Verification could not resolve this mutation: ${failure.message}`,
          failure.kind === 'authentication',
        ),
      )
    })
    result.unconfirmedIds.forEach((entryId) => {
      accountedEntryIds.add(entryId)
      failures.push(
        stillUncertain(
          entryId,
          'AniList still did not return this entry during targeted verification.',
        ),
      )
    })
    result.unattemptedIds.forEach((entryId) => {
      accountedEntryIds.add(entryId)
      failures.push(
        stillUncertain(
          entryId,
          'Targeted verification did not reach this uncertain mutation.',
        ),
      )
    })
  }

  uncertainEntryIds.forEach((entryId) => {
    if (!accountedEntryIds.has(entryId)) {
      failures.push(
        stillUncertain(entryId, 'No matching command was available for verification.'),
      )
    }
  })
  uncertainMediaIds.forEach((mediaId) => {
    if (!accountedMediaIds.has(mediaId)) {
      creationFailures.push(
        stillUncertainCreation(
          mediaId,
          'No matching creation command was available for verification.',
        ),
      )
    }
  })

  const successes =
    confirmedPatches.length +
    confirmedDeletedIds.length +
    confirmedCreatedEntries.length
  return {
    status: terminalStatus(
      successes,
      failures,
      creationFailures,
      [...unattemptedIds],
      [...unattemptedMediaIds],
    ),
    confirmedPatches,
    confirmedDeletedIds,
    confirmedCreatedEntries,
    failures,
    creationFailures,
    unattemptedIds: [...unattemptedIds],
    unattemptedMediaIds: [...unattemptedMediaIds],
    stats: gateway.getRateLimitStats(),
  }
}
