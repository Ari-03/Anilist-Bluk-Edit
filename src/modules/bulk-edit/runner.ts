import type {
  AniListGateway,
  GatewayBatchOutcome,
  GatewayCreateOutcome,
  GatewayEntryFailure,
  GatewayEntrySnapshot,
  GatewayMediaFailure,
  GatewayMutationProgress,
  MutableEntryPatch,
} from '../anilist'
import type {
  BulkChanges,
  BulkCreateCommand,
  BulkCreateJobOutcome,
  BulkDeleteCommand,
  BulkEditCommand,
  BulkEditRunner,
  BulkJobHandle,
  BulkJobOutcome,
  BulkJobProgress,
  BulkRunnerCommand,
  ConfirmedCreatedEntry,
  ConfirmedEntryPatch,
  CreationFailure,
  EntryFailure,
  FieldEdit,
  MediaListEntryId,
} from './types'

export const unchanged = <T>(): FieldEdit<T> => ({ kind: 'unchanged' })
export const setTo = <T>(value: T): FieldEdit<T> => ({ kind: 'set', value })

const uniqueEntryIds = (ids: readonly number[]): number[] =>
  [...new Set(ids)].filter((id) => Number.isSafeInteger(id) && id > 0)

const freezeChanges = (changes: BulkChanges): BulkChanges =>
  Object.freeze({
    status: Object.freeze({ ...changes.status }),
    score: Object.freeze({ ...changes.score }),
    progress: Object.freeze({ ...changes.progress }),
    private: Object.freeze({ ...changes.private }),
    hiddenFromStatusLists: Object.freeze({ ...changes.hiddenFromStatusLists }),
    notes: Object.freeze({ ...changes.notes }),
    customLists: Object.freeze({ ...changes.customLists }),
  })

const freezeCommand = (command: BulkRunnerCommand): BulkRunnerCommand => {
  if (command.operation === 'create') {
    const byMediaId = new Map(
      command.entries
        .filter((entry) => Number.isSafeInteger(entry.mediaId) && entry.mediaId > 0)
        .map((entry) => [entry.mediaId, Object.freeze({ ...entry })]),
    )
    return Object.freeze({
      accountId: command.accountId,
      mediaType: command.mediaType,
      operation: 'create' as const,
      entries: Object.freeze([...byMediaId.values()]),
    })
  }
  const base = {
    accountId: command.accountId,
    mediaType: command.mediaType,
    entryIds: Object.freeze(uniqueEntryIds(command.entryIds)),
  }
  return command.operation === 'delete'
    ? Object.freeze({ ...base, operation: 'delete' as const })
    : Object.freeze({ ...base, operation: 'update' as const, changes: freezeChanges(command.changes) })
}

const commandTargetIds = (command: BulkRunnerCommand): readonly number[] =>
  command.operation === 'create'
    ? command.entries.map((entry) => entry.mediaId)
    : command.entryIds

const toPublicFailure = (failure: GatewayEntryFailure): EntryFailure => ({
  entryId: failure.entryId,
  kind: failure.kind,
  message: failure.message,
  retryable: failure.retryable,
})

const toCreationFailure = (failure: GatewayMediaFailure): CreationFailure => ({
  mediaId: failure.mediaId,
  kind: failure.kind,
  message: failure.message,
  retryable: failure.retryable,
})

const unknownFailure = (
  entryId: number,
  message: string,
  authenticationConfirmed = false,
): EntryFailure => ({
  entryId,
  kind: 'unknown',
  message,
  retryable: false,
  ...(authenticationConfirmed ? { authenticationConfirmed: true } : {}),
})

const unknownCreationFailure = (
  mediaId: number,
  message: string,
  authenticationConfirmed = false,
): CreationFailure => ({
  mediaId,
  kind: 'unknown',
  message,
  retryable: false,
  ...(authenticationConfirmed ? { authenticationConfirmed: true } : {}),
})

const inconclusiveVerificationFailure = (
  failure: GatewayEntryFailure,
): EntryFailure =>
  unknownFailure(
    failure.entryId,
    `Targeted verification could not resolve this mutation: ${failure.message}`,
    failure.kind === 'authentication',
  )

const inconclusiveCreationVerificationFailure = (
  failure: GatewayMediaFailure,
): CreationFailure =>
  unknownCreationFailure(
    failure.mediaId,
    `Targeted verification could not resolve this creation: ${failure.message}`,
    failure.kind === 'authentication',
  )

const fieldValue = <K extends keyof MutableEntryPatch>(
  result: MutableEntryPatch,
  key: K,
  edit: FieldEdit<NonNullable<MutableEntryPatch[K]>>,
): void => {
  if (edit.kind === 'set') result[key] = edit.value as MutableEntryPatch[K]
}

const sharedValues = (changes: BulkChanges): MutableEntryPatch => {
  const values: MutableEntryPatch = {}
  fieldValue(values, 'status', changes.status)
  fieldValue(values, 'score', changes.score)
  fieldValue(values, 'progress', changes.progress)
  fieldValue(values, 'private', changes.private)
  fieldValue(values, 'hiddenFromStatusLists', changes.hiddenFromStatusLists)
  fieldValue(values, 'notes', changes.notes)
  return values
}

const hasValues = (values: MutableEntryPatch): boolean => Object.keys(values).length > 0

const hasCustomListChanges = (changes: BulkChanges): boolean =>
  Object.values(changes.customLists).some((change) => change !== 'keep')

const currentCustomLists = (snapshot: GatewayEntrySnapshot): Record<string, boolean> =>
  Object.fromEntries(
    Object.entries(snapshot.values.customLists ?? {}).filter(([, enabled]) => enabled),
  )

const applyCustomListChanges = (
  snapshot: GatewayEntrySnapshot,
  changes: BulkChanges,
): Record<string, boolean> => {
  const result = currentCustomLists(snapshot)
  for (const [name, change] of Object.entries(changes.customLists)) {
    if (change === 'add') result[name] = true
    if (change === 'remove') delete result[name]
  }
  return result
}

const normalizedCustomListNames = (value: unknown): string[] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.entries(value)
    .filter((entry) => entry[1] === true)
    .map(([name]) => name)
    .sort()
}

const matchesExpected = (
  actual: MutableEntryPatch,
  expected: MutableEntryPatch,
): boolean =>
  Object.entries(expected).every(([key, expectedValue]) => {
    if (key === 'customLists') {
      return (
        JSON.stringify(normalizedCustomListNames(actual.customLists)) ===
        JSON.stringify(normalizedCustomListNames(expectedValue))
      )
    }
    if (key === 'notes') return (actual.notes ?? '') === (expectedValue ?? '')
    return Object.is(actual[key as keyof MutableEntryPatch], expectedValue)
  })

const mergeBatchOutcomes = (
  first: GatewayBatchOutcome,
  second: GatewayBatchOutcome,
  replacedIds: ReadonlySet<number>,
): GatewayBatchOutcome => ({
  confirmed: [
    ...first.confirmed.filter((item) => !replacedIds.has(item.entryId)),
    ...second.confirmed,
  ],
  confirmedDeletedIds: [
    ...first.confirmedDeletedIds.filter((id) => !replacedIds.has(id)),
    ...second.confirmedDeletedIds,
  ],
  failures: [
    ...first.failures.filter((item) => !replacedIds.has(item.entryId)),
    ...second.failures,
  ],
  unconfirmedIds: [
    ...first.unconfirmedIds.filter((id) => !replacedIds.has(id)),
    ...second.unconfirmedIds,
  ],
  unattemptedIds: [
    ...first.unattemptedIds.filter((id) => !replacedIds.has(id)),
    ...second.unattemptedIds,
  ],
})

const verifyUnknownExecution = (
  outcome: GatewayBatchOutcome,
): GatewayBatchOutcome => {
  const unknownExecutionIds = outcome.failures
    .filter((failure) => failure.execution === 'unknown')
    .map((failure) => failure.entryId)
  if (unknownExecutionIds.length === 0) return outcome
  return {
    ...outcome,
    failures: outcome.failures.filter(
      (failure) => failure.execution !== 'unknown',
    ),
    unconfirmedIds: [
      ...new Set([...outcome.unconfirmedIds, ...unknownExecutionIds]),
    ],
  }
}

const verifyUnknownCreationExecution = (
  outcome: GatewayCreateOutcome,
): GatewayCreateOutcome => {
  const unknownExecutionMediaIds = outcome.failures
    .filter((failure) => failure.execution === 'unknown')
    .map((failure) => failure.mediaId)
  if (unknownExecutionMediaIds.length === 0) return outcome
  return {
    ...outcome,
    failures: outcome.failures.filter(
      (failure) => failure.execution !== 'unknown',
    ),
    unconfirmedMediaIds: [
      ...new Set([
        ...outcome.unconfirmedMediaIds,
        ...unknownExecutionMediaIds,
      ]),
    ],
  }
}

const emptyGatewayBatchOutcome = (): GatewayBatchOutcome => ({
  confirmed: [],
  confirmedDeletedIds: [],
  failures: [],
  unconfirmedIds: [],
  unattemptedIds: [],
})

const outcomeStatus = (
  cancelled: boolean,
  successes: number,
  failures: readonly { kind: EntryFailure['kind'] }[],
  unattemptedIds: readonly number[],
): BulkJobOutcome['status'] => {
  if (cancelled) return 'cancelled'
  if (failures.some((failure) => failure.kind === 'unknown')) return 'unknown'
  if (failures.length === 0 && unattemptedIds.length === 0) return 'completed'
  return successes > 0 ? 'partial' : 'failed'
}

const dedupeById = <T extends { entryId: number }>(values: readonly T[]): T[] => {
  const byId = new Map<number, T>()
  values.forEach((value) => byId.set(value.entryId, value))
  return [...byId.values()]
}

class BulkJob implements BulkJobHandle {
  readonly result: Promise<BulkJobOutcome>
  private readonly controller = new AbortController()
  private readonly listeners = new Set<(progress: BulkJobProgress) => void>()

  constructor(
    private readonly gateway: AniListGateway,
    private readonly command: BulkRunnerCommand,
  ) {
    this.result = Promise.resolve()
      .then(() => this.run())
      .catch((error: unknown) => this.catastrophicOutcome(error))
  }

  cancel(): void {
    this.controller.abort()
  }

  subscribe(listener: (progress: BulkJobProgress) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private async run(): Promise<BulkJobOutcome> {
    this.emit('preparing')
    if (commandTargetIds(this.command).length === 0) {
      return this.command.operation === 'create'
        ? this.finishCreate([], [], [])
        : this.finish([], [], [], [])
    }
    if (this.command.operation === 'create') return this.runCreate(this.command)
    return this.command.operation === 'delete'
      ? this.runDelete(this.command)
      : this.runUpdate(this.command)
  }

  private async runCreate(command: BulkCreateCommand): Promise<BulkJobOutcome> {
    const expected = new Map<number, MutableEntryPatch>(
      command.entries.map((entry) => [
        entry.mediaId,
        {
          status: entry.status,
          ...(entry.progress === undefined ? {} : { progress: entry.progress }),
        },
      ]),
    )
    this.emit('mutating')
    const mutation = verifyUnknownCreationExecution(
      await this.gateway.createEntries({
        accountId: command.accountId,
        entries: command.entries,
        signal: this.controller.signal,
        onProgress: (progress) => this.emitGatewayProgress(progress),
      }),
    )
    const confirmed: ConfirmedCreatedEntry[] = mutation.confirmed.map((entry) => ({
      entryId: entry.entryId,
      mediaId: entry.mediaId,
      mediaType: command.mediaType,
      values: entry.values,
      ...(entry.updatedAt === undefined ? {} : { updatedAt: entry.updatedAt }),
    }))
    const failures = mutation.failures.map(toCreationFailure)

    if (mutation.unconfirmedMediaIds.length > 0) {
      if (this.controller.signal.aborted) {
        failures.push(
          ...mutation.unconfirmedMediaIds.map((mediaId) =>
            unknownCreationFailure(
              mediaId,
              'The creation may have completed; use targeted verification before retrying.',
            ),
          ),
        )
      } else {
        this.emit(
          'verifying',
          confirmed.length,
          failures.length,
          mutation.unattemptedMediaIds.length,
        )
        const verification = await this.verifyCreations(
          command,
          mutation.unconfirmedMediaIds,
          expected,
        )
        confirmed.push(...verification.confirmed)
        failures.push(...verification.failures)
      }
    }

    return this.finishCreate(
      confirmed,
      failures,
      mutation.unattemptedMediaIds,
    )
  }

  private async verifyCreations(
    command: BulkCreateCommand,
    mediaIds: readonly number[],
    expectedByMediaId: ReadonlyMap<number, MutableEntryPatch>,
  ): Promise<{
    confirmed: ConfirmedCreatedEntry[]
    failures: CreationFailure[]
  }> {
    const result = await this.gateway.readEntriesByMediaIds({
      accountId: command.accountId,
      mediaIds,
      signal: this.controller.signal,
    })
    const confirmed: ConfirmedCreatedEntry[] = []
    const failures = result.failures.map(
      inconclusiveCreationVerificationFailure,
    )
    const accounted = new Set(result.failures.map((failure) => failure.mediaId))

    result.entries.forEach((entry) => {
      accounted.add(entry.mediaId)
      const expected = expectedByMediaId.get(entry.mediaId)!
      if (matchesExpected(entry.values, expected)) {
        confirmed.push({
          entryId: entry.entryId,
          mediaId: entry.mediaId,
          mediaType: command.mediaType,
          values: { ...expected, ...entry.values },
          ...(entry.updatedAt === undefined ? {} : { updatedAt: entry.updatedAt }),
        })
      } else {
        failures.push(
          unknownCreationFailure(
            entry.mediaId,
            'AniList returned different values during targeted creation verification.',
          ),
        )
      }
    })
    result.missingMediaIds.forEach((mediaId) => {
      accounted.add(mediaId)
      failures.push(
        unknownCreationFailure(
          mediaId,
          'AniList did not contain the entry during targeted creation verification.',
        ),
      )
    })
    mediaIds.forEach((mediaId) => {
      if (!accounted.has(mediaId)) {
        failures.push(
          unknownCreationFailure(mediaId, 'The creation result could not be verified.'),
        )
      }
    })
    return { confirmed, failures }
  }

  private async runUpdate(command: BulkEditCommand): Promise<BulkJobOutcome> {
    const values = sharedValues(command.changes)
    const customListsChanged = hasCustomListChanges(command.changes)
    if (!hasValues(values) && !customListsChanged) {
      return this.finish(
        [],
        [],
        command.entryIds.map((entryId) => ({
          entryId,
          kind: 'validation' as const,
          message: 'Choose at least one field to edit.',
          retryable: false,
        })),
        [],
      )
    }

    const expected = new Map<number, MutableEntryPatch>()
    let mutation: GatewayBatchOutcome

    if (customListsChanged) {
      this.emit('preflight')
      const preflight = await this.gateway.readEntries({
        accountId: command.accountId,
        entryIds: command.entryIds,
        signal: this.controller.signal,
      })
      if (this.controller.signal.aborted) {
        return this.finish(
          [],
          [],
          preflight.failures.map(toPublicFailure),
          command.entryIds.filter(
            (id) => !preflight.failures.some((failure) => failure.entryId === id),
          ),
        )
      }

      const preflightFailures: GatewayEntryFailure[] = [
        ...preflight.failures,
        ...preflight.missingIds.map((entryId) => ({
          entryId,
          kind: 'validation' as const,
          message: 'AniList no longer has this media-list entry.',
          retryable: false,
          execution: 'not-started' as const,
        })),
        ...preflight.unconfirmedIds.map((entryId) => ({
          entryId,
          kind: 'unknown' as const,
          message: 'AniList did not return current custom-list membership.',
          retryable: true,
          execution: 'not-started' as const,
        })),
      ]
      const failedIds = new Set(preflightFailures.map((failure) => failure.entryId))
      const entries = preflight.entries
        .filter((snapshot) => !failedIds.has(snapshot.entryId))
        .map((snapshot) => {
          const entryValues: MutableEntryPatch = {
            ...values,
            customLists: applyCustomListChanges(snapshot, command.changes),
          }
          expected.set(snapshot.entryId, entryValues)
          return { target: snapshot, values: entryValues }
        })

      this.emit('mutating')
      const saved =
        entries.length === 0
          ? emptyGatewayBatchOutcome()
          : verifyUnknownExecution(
              await this.gateway.saveEntries({
                accountId: command.accountId,
                entries,
                signal: this.controller.signal,
                onProgress: (progress) =>
                  this.emitGatewayProgress(progress, {
                    attempted: failedIds.size,
                    failed: failedIds.size,
                  }),
              }),
            )
      mutation = {
        ...saved,
        failures: [...preflightFailures, ...saved.failures],
        unattemptedIds: [...preflight.unattemptedIds, ...saved.unattemptedIds],
      }
    } else {
      command.entryIds.forEach((entryId) => expected.set(entryId, values))
      this.emit('mutating')
      mutation = verifyUnknownExecution(
        await this.gateway.updateShared({
          accountId: command.accountId,
          entryIds: command.entryIds,
          values,
          signal: this.controller.signal,
          onProgress: (progress) => this.emitGatewayProgress(progress),
        }),
      )
      mutation = await this.fallbackKnownValidation(command, values, mutation, expected)
    }

    const patches: ConfirmedEntryPatch[] = mutation.confirmed.map((patch) => ({
      entryId: patch.entryId,
      mediaType: command.mediaType,
      values: patch.values,
      ...(patch.updatedAt === undefined ? {} : { updatedAt: patch.updatedAt }),
    }))
    const failures = mutation.failures.map(toPublicFailure)

    if (mutation.unconfirmedIds.length > 0) {
      if (this.controller.signal.aborted) {
        failures.push(
          ...mutation.unconfirmedIds.map((entryId) =>
            unknownFailure(
              entryId,
              'The mutation may have completed; use targeted verification before retrying.',
            ),
          ),
        )
      } else {
        this.emit(
          'verifying',
          patches.length,
          failures.length,
          mutation.unattemptedIds.length,
        )
        const verification = await this.verifyUpdates(
          command,
          mutation.unconfirmedIds,
          expected,
        )
        patches.push(...verification.patches)
        failures.push(...verification.failures)
      }
    }

    return this.finish(patches, [], failures, mutation.unattemptedIds)
  }

  private async fallbackKnownValidation(
    command: BulkEditCommand,
    values: MutableEntryPatch,
    outcome: GatewayBatchOutcome,
    expected: Map<number, MutableEntryPatch>,
  ): Promise<GatewayBatchOutcome> {
    const fallbackIds = outcome.failures
      .filter(
        (failure) =>
          failure.kind === 'validation' && failure.execution === 'not-started',
      )
      .map((failure) => failure.entryId)
    if (fallbackIds.length === 0 || this.controller.signal.aborted) return outcome

    this.emit('preflight', outcome.confirmed.length, outcome.failures.length)
    const preflight = await this.gateway.readEntries({
      accountId: command.accountId,
      entryIds: fallbackIds,
      signal: this.controller.signal,
    })
    const replacementIds = new Set(fallbackIds)
    const fallbackFailures: GatewayEntryFailure[] = [
      ...preflight.failures,
      ...preflight.missingIds.map((entryId) => ({
        entryId,
        kind: 'validation' as const,
        message: 'AniList no longer has this media-list entry.',
        retryable: false,
        execution: 'not-started' as const,
      })),
      ...preflight.unconfirmedIds.map((entryId) => ({
        entryId,
        kind: 'unknown' as const,
        message: 'AniList did not return the entry needed for the fallback save.',
        retryable: true,
        execution: 'not-started' as const,
      })),
    ]
    const fallbackFailureIds = new Set(
      fallbackFailures.map((failure) => failure.entryId),
    )
    const saved =
      preflight.entries.length === 0
        ? emptyGatewayBatchOutcome()
        : verifyUnknownExecution(
            await this.gateway.saveEntries({
              accountId: command.accountId,
              entries: preflight.entries.map((target) => ({ target, values })),
              signal: this.controller.signal,
              onProgress: (progress) =>
                this.emitGatewayProgress(progress, {
                  attempted: Math.max(
                    0,
                    command.entryIds.length -
                      outcome.unattemptedIds.length -
                      replacementIds.size +
                      fallbackFailureIds.size,
                  ),
                  confirmed: outcome.confirmed.filter(
                    (entry) => !replacementIds.has(entry.entryId),
                  ).length,
                  failed: outcome.failures.filter(
                    (entry) => !replacementIds.has(entry.entryId),
                  ).length + fallbackFailureIds.size,
                }),
            }),
          )
    preflight.entries.forEach((entry) => expected.set(entry.entryId, values))
    return mergeBatchOutcomes(
      outcome,
      {
        ...saved,
        failures: [...fallbackFailures, ...saved.failures],
        unattemptedIds: [
          ...preflight.unattemptedIds,
          ...saved.unattemptedIds,
        ],
      },
      replacementIds,
    )
  }

  private async verifyUpdates(
    command: BulkEditCommand,
    entryIds: readonly number[],
    expectedById: ReadonlyMap<number, MutableEntryPatch>,
  ): Promise<{ patches: ConfirmedEntryPatch[]; failures: EntryFailure[] }> {
    const result = await this.gateway.readEntries({
      accountId: command.accountId,
      entryIds,
      signal: this.controller.signal,
    })
    const patches: ConfirmedEntryPatch[] = []
    const failures = result.failures.map(inconclusiveVerificationFailure)
    const accounted = new Set(result.failures.map((failure) => failure.entryId))

    for (const snapshot of result.entries) {
      accounted.add(snapshot.entryId)
      const expected = expectedById.get(snapshot.entryId)!
      if (matchesExpected(snapshot.values, expected)) {
        patches.push({
          entryId: snapshot.entryId,
          mediaType: command.mediaType,
          values: { ...expected, ...snapshot.values },
          ...(snapshot.updatedAt === undefined ? {} : { updatedAt: snapshot.updatedAt }),
        })
      } else {
        failures.push(
          unknownFailure(
            snapshot.entryId,
            'AniList returned a different value during targeted verification.',
          ),
        )
      }
    }
    for (const entryId of result.missingIds) {
      accounted.add(entryId)
      failures.push(
        unknownFailure(entryId, 'The entry disappeared during targeted verification.'),
      )
    }
    for (const entryId of entryIds) {
      if (!accounted.has(entryId)) {
        failures.push(
          unknownFailure(entryId, 'The mutation result could not be verified with AniList.'),
        )
      }
    }
    return { patches, failures }
  }

  private async runDelete(command: BulkDeleteCommand): Promise<BulkJobOutcome> {
    this.emit('mutating')
    const mutation = verifyUnknownExecution(
      await this.gateway.deleteEntries({
        accountId: command.accountId,
        entryIds: command.entryIds,
        signal: this.controller.signal,
        onProgress: (progress) => this.emitGatewayProgress(progress),
      }),
    )
    const deletedIds = [...mutation.confirmedDeletedIds]
    const failures = mutation.failures.map(toPublicFailure)

    if (mutation.unconfirmedIds.length > 0) {
      if (this.controller.signal.aborted) {
        failures.push(
          ...mutation.unconfirmedIds.map((entryId) =>
            unknownFailure(
              entryId,
              'The deletion may have completed; use targeted verification before retrying.',
            ),
          ),
        )
      } else {
        this.emit(
          'verifying',
          deletedIds.length,
          failures.length,
          mutation.unattemptedIds.length,
        )
        const verification = await this.gateway.readEntries({
          accountId: command.accountId,
          entryIds: mutation.unconfirmedIds,
          signal: this.controller.signal,
        })
        deletedIds.push(...verification.missingIds)
        failures.push(
          ...verification.failures.map(inconclusiveVerificationFailure),
        )
        const known = new Set([
          ...verification.missingIds,
          ...verification.failures.map((failure) => failure.entryId),
        ])
        verification.entries.forEach((entry) => {
          known.add(entry.entryId)
          failures.push(
            unknownFailure(entry.entryId, 'AniList still returned the entry after deletion.'),
          )
        })
        mutation.unconfirmedIds.forEach((entryId) => {
          if (!known.has(entryId)) {
            failures.push(
              unknownFailure(entryId, 'The deletion result could not be verified with AniList.'),
            )
          }
        })
      }
    }
    return this.finish([], deletedIds, failures, mutation.unattemptedIds)
  }

  private finishCreate(
    rawConfirmed: readonly ConfirmedCreatedEntry[],
    rawFailures: readonly CreationFailure[],
    rawUnattemptedMediaIds: readonly number[],
  ): BulkCreateJobOutcome {
    const byMediaId = new Map<number, ConfirmedCreatedEntry>()
    rawConfirmed.forEach((entry) => byMediaId.set(entry.mediaId, entry))
    const confirmedCreatedEntries = [...byMediaId.values()]
    const successfulMediaIds = new Set(
      confirmedCreatedEntries.map((entry) => entry.mediaId),
    )
    const failuresByMediaId = new Map<number, CreationFailure>()
    rawFailures.forEach((failure) => {
      if (!successfulMediaIds.has(failure.mediaId)) {
        failuresByMediaId.set(failure.mediaId, failure)
      }
    })
    const creationFailures = [...failuresByMediaId.values()]
    const failedMediaIds = new Set(
      creationFailures.map((failure) => failure.mediaId),
    )
    const unattemptedMediaIds = [...new Set(rawUnattemptedMediaIds)].filter(
      (mediaId) =>
        !successfulMediaIds.has(mediaId) && !failedMediaIds.has(mediaId),
    )
    const targetMediaIds = commandTargetIds(this.command)

    if (!this.controller.signal.aborted) {
      const unattempted = new Set(unattemptedMediaIds)
      targetMediaIds.forEach((mediaId) => {
        if (
          !successfulMediaIds.has(mediaId) &&
          !failedMediaIds.has(mediaId) &&
          !unattempted.has(mediaId)
        ) {
          const failure = unknownCreationFailure(
            mediaId,
            'The bulk job did not receive a creation outcome from AniList.',
          )
          creationFailures.push(failure)
          failedMediaIds.add(mediaId)
        }
      })
    } else {
      targetMediaIds.forEach((mediaId) => {
        if (
          !successfulMediaIds.has(mediaId) &&
          !failedMediaIds.has(mediaId) &&
          !unattemptedMediaIds.includes(mediaId)
        ) {
          unattemptedMediaIds.push(mediaId)
        }
      })
    }

    const result: BulkCreateJobOutcome = {
      status: outcomeStatus(
        this.controller.signal.aborted,
        successfulMediaIds.size,
        creationFailures,
        unattemptedMediaIds,
      ),
      confirmedPatches: [],
      confirmedDeletedIds: [],
      confirmedCreatedEntries,
      failures: [],
      creationFailures,
      unattemptedIds: [],
      unattemptedMediaIds,
      stats: this.gateway.getRateLimitStats(),
    }
    this.emit(
      'completed',
      successfulMediaIds.size,
      creationFailures.length,
      unattemptedMediaIds.length,
    )
    return result
  }

  private finish(
    patches: readonly ConfirmedEntryPatch[],
    deletedIds: readonly MediaListEntryId[],
    rawFailures: readonly EntryFailure[],
    rawUnattemptedIds: readonly MediaListEntryId[],
  ): BulkJobOutcome {
    const confirmedPatches = dedupeById(patches)
    const confirmedDeletedIds = [...new Set(deletedIds)]
    const successfulIds = new Set([
      ...confirmedPatches.map((patch) => patch.entryId),
      ...confirmedDeletedIds,
    ])
    const failures = dedupeById(rawFailures).filter(
      (failure) => !successfulIds.has(failure.entryId),
    )
    const failedIds = new Set(failures.map((failure) => failure.entryId))
    const unattemptedIds = [...new Set(rawUnattemptedIds)].filter(
      (entryId) => !successfulIds.has(entryId) && !failedIds.has(entryId),
    )

    const targetEntryIds = commandTargetIds(this.command)
    if (!this.controller.signal.aborted) {
      const unattemptedSet = new Set(unattemptedIds)
      for (const entryId of targetEntryIds) {
        if (
          !successfulIds.has(entryId) &&
          !failedIds.has(entryId) &&
          !unattemptedSet.has(entryId)
        ) {
          const failure = unknownFailure(
            entryId,
            'The bulk job did not receive a per-entry outcome from AniList.',
          )
          failures.push(failure)
          failedIds.add(entryId)
        }
      }
    }

    if (this.controller.signal.aborted) {
      // Retain unattempted IDs for Retry remaining; failures are reserved for
      // attempted work, including ambiguous in-flight mutations.
      for (const entryId of targetEntryIds) {
        if (!successfulIds.has(entryId) && !failedIds.has(entryId) && !unattemptedIds.includes(entryId)) {
          unattemptedIds.push(entryId)
        }
      }
    }

    const result: BulkJobOutcome = {
      status: outcomeStatus(
        this.controller.signal.aborted,
        successfulIds.size,
        failures,
        unattemptedIds,
      ),
      confirmedPatches,
      confirmedDeletedIds,
      confirmedCreatedEntries: [],
      failures,
      creationFailures: [],
      unattemptedIds,
      unattemptedMediaIds: [],
      stats: this.gateway.getRateLimitStats(),
    }
    this.emit(
      'completed',
      successfulIds.size,
      failures.length,
      unattemptedIds.length,
    )
    return result
  }

  private catastrophicOutcome(error: unknown): BulkJobOutcome {
    const message = error instanceof Error ? error.message : 'Unexpected bulk-job failure.'
    if (this.command.operation === 'create') {
      const creationFailures = this.controller.signal.aborted
        ? []
        : this.command.entries.map((entry) =>
            unknownCreationFailure(entry.mediaId, message),
          )
      return {
        status: this.controller.signal.aborted ? 'cancelled' : 'unknown',
        confirmedPatches: [],
        confirmedDeletedIds: [],
        confirmedCreatedEntries: [],
        failures: [],
        creationFailures,
        unattemptedIds: [],
        unattemptedMediaIds: this.controller.signal.aborted
          ? this.command.entries.map((entry) => entry.mediaId)
          : [],
        stats: this.gateway.getRateLimitStats(),
      }
    }
    const failures = this.controller.signal.aborted
      ? []
      : this.command.entryIds.map((entryId) => unknownFailure(entryId, message))
    const unattemptedIds = this.controller.signal.aborted ? [...this.command.entryIds] : []
    return {
      status: this.controller.signal.aborted ? 'cancelled' : 'unknown',
      confirmedPatches: [],
      confirmedDeletedIds: [],
      confirmedCreatedEntries: [],
      failures,
      creationFailures: [],
      unattemptedIds,
      unattemptedMediaIds: [],
      stats: this.gateway.getRateLimitStats(),
    }
  }

  private emit(
    phase: BulkJobProgress['phase'],
    confirmed = 0,
    failed = 0,
    unattempted = 0,
    attempted?: number,
  ): void {
    const progress: BulkJobProgress = {
      phase,
      total: commandTargetIds(this.command).length,
      attempted:
        attempted ??
        (phase === 'completed' || phase === 'verifying'
          ? Math.max(0, commandTargetIds(this.command).length - unattempted)
          : Math.min(
              commandTargetIds(this.command).length,
              confirmed + failed,
            )),
      confirmed,
      failed,
      unattempted,
      stats: this.gateway.getRateLimitStats(),
    }
    this.listeners.forEach((listener) => listener(progress))
  }

  private emitGatewayProgress(
    progress: GatewayMutationProgress,
    base: {
      attempted?: number
      confirmed?: number
      failed?: number
    } = {},
  ): void {
    const total = commandTargetIds(this.command).length
    const attempted = Math.min(total, (base.attempted ?? 0) + progress.attempted)
    this.emit(
      'mutating',
      Math.min(total, (base.confirmed ?? 0) + progress.confirmed),
      Math.min(total, (base.failed ?? 0) + progress.failed),
      Math.max(0, total - attempted),
      attempted,
    )
  }
}

class DefaultBulkEditRunner implements BulkEditRunner {
  constructor(private readonly gateway: AniListGateway) {}

  start(command: BulkCreateCommand): BulkJobHandle<BulkCreateJobOutcome>
  start(command: BulkRunnerCommand): BulkJobHandle
  start(command: BulkRunnerCommand): BulkJobHandle {
    return new BulkJob(this.gateway, freezeCommand(command))
  }
}

export const createBulkEditRunner = (gateway: AniListGateway): BulkEditRunner =>
  new DefaultBulkEditRunner(gateway)
