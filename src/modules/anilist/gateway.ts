import { AniListTransportError, SchedulerCancelledError } from './errors'
import { AniListFetchTransport, type AniListFetchTransportOptions } from './fetch-transport'
import { AniListReadFacade } from './read-side'
import type {
  AniListGateway,
  CreateEntriesRequest,
  DeleteEntriesRequest,
  GatewayBatchOutcome,
  GatewayConfirmedPatch,
  GatewayCreateInput,
  GatewayCreateOutcome,
  GatewayCreatedEntry,
  GatewayEntryFailure,
  GatewayEntrySnapshot,
  GatewayFailureKind,
  GatewayMediaFailure,
  GatewayMutationProgressListener,
  GatewaySaveRequest,
  GraphQLError,
  GraphQLResult,
  GraphQLTransport,
  MutableEntryPatch,
  RateLimitStats,
  ReadEntriesByMediaIdsOutcome,
  ReadEntriesByMediaIdsRequest,
  ReadEntriesOutcome,
  ReadEntriesRequest,
  SaveEntriesRequest,
  UpdateSharedRequest,
} from './types'

const MUTABLE_FIELDS = `
  id
  mediaId
  status
  score
  progress
  private
  hiddenFromStatusLists
  notes
  customLists
  updatedAt
`

const SHARED_MUTATION = `
  mutation BulkUpdateMediaListEntries(
    $ids: [Int]
    $status: MediaListStatus
    $score: Float
    $progress: Int
    $private: Boolean
    $hiddenFromStatusLists: Boolean
    $notes: String
  ) {
    UpdateMediaListEntries(
      ids: $ids
      status: $status
      score: $score
      progress: $progress
      private: $private
      hiddenFromStatusLists: $hiddenFromStatusLists
      notes: $notes
    ) {
      ${MUTABLE_FIELDS}
    }
  }
`

const mutableKeys = [
  'status',
  'score',
  'progress',
  'private',
  'hiddenFromStatusLists',
  'notes',
  'customLists',
] as const

type RawEntry = Record<string, unknown>

const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key)

const chunks = <T>(values: readonly T[], size: number): T[][] => {
  const result: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size))
  }
  return result
}

const uniqueIds = (ids: readonly number[]): number[] =>
  [...new Set(ids)].filter((id) => Number.isSafeInteger(id) && id > 0)

const emptyBatch = (): {
  confirmed: GatewayConfirmedPatch[]
  confirmedDeletedIds: number[]
  failures: GatewayEntryFailure[]
  unconfirmedIds: number[]
  unattemptedIds: number[]
} => ({
  confirmed: [],
  confirmedDeletedIds: [],
  failures: [],
  unconfirmedIds: [],
  unattemptedIds: [],
})

const emptyCreate = (): {
  confirmed: GatewayCreatedEntry[]
  failures: GatewayMediaFailure[]
  unconfirmedMediaIds: number[]
  unattemptedMediaIds: number[]
} => ({
  confirmed: [],
  failures: [],
  unconfirmedMediaIds: [],
  unattemptedMediaIds: [],
})

const notifyMutationProgress = (
  listener: GatewayMutationProgressListener | undefined,
  progress: Parameters<GatewayMutationProgressListener>[0],
): void => {
  if (!listener) return
  try {
    listener(progress)
  } catch {
    // Progress observers must never change the mutation outcome.
  }
}

const uniqueCreateInputs = (
  entries: readonly GatewayCreateInput[],
): GatewayCreateInput[] => {
  const byMediaId = new Map<number, GatewayCreateInput>()
  entries.forEach((entry) => {
    if (Number.isSafeInteger(entry.mediaId) && entry.mediaId > 0) {
      byMediaId.set(entry.mediaId, entry)
    }
  })
  return [...byMediaId.values()]
}

const normalizeCustomLists = (value: unknown): Record<string, boolean> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === 'boolean',
    ),
  )
}

const canonicalValues = (record: RawEntry): MutableEntryPatch => {
  const values: Record<string, unknown> = {}
  for (const key of mutableKeys) {
    if (!hasOwn(record, key)) continue
    if (key === 'customLists') {
      values[key] = normalizeCustomLists(record[key])
    } else if (key === 'notes' && record[key] === null) {
      values[key] = ''
    } else {
      values[key] = record[key]
    }
  }
  return values as MutableEntryPatch
}

const trueCustomListNames = (value: Readonly<Record<string, boolean>>): string[] =>
  Object.entries(value)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)

const mutationVariables = (values: MutableEntryPatch): Record<string, unknown> => ({
  ...(hasOwn(values, 'status') ? { status: values.status } : {}),
  ...(hasOwn(values, 'score') ? { score: values.score } : {}),
  ...(hasOwn(values, 'progress') ? { progress: values.progress } : {}),
  ...(hasOwn(values, 'private') ? { private: values.private } : {}),
  ...(hasOwn(values, 'hiddenFromStatusLists')
    ? { hiddenFromStatusLists: values.hiddenFromStatusLists }
    : {}),
  ...(hasOwn(values, 'notes') ? { notes: values.notes } : {}),
  ...(values.customLists
    ? { customLists: trueCustomListNames(values.customLists) }
    : {}),
})

const asRecord = (value: unknown): RawEntry | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as RawEntry)
    : null

const asEntryId = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null

const toConfirmed = (
  entryId: number,
  requested: MutableEntryPatch,
  response: RawEntry,
): GatewayConfirmedPatch => ({
  entryId,
  values: { ...requested, ...canonicalValues(response) },
  ...(typeof response.updatedAt === 'number' ? { updatedAt: response.updatedAt } : {}),
})

const errorStatus = (error: GraphQLError): number | null => {
  const status = error.extensions?.status ?? error.extensions?.statusCode
  const parsed = typeof status === 'number' ? status : Number(status)
  return Number.isFinite(parsed) ? parsed : null
}

const classifyGraphQLError = (error: GraphQLError): GatewayFailureKind => {
  const message = error.message.toLowerCase()
  const status = errorStatus(error)
  if (
    status === 401 ||
    message.includes('invalid token') ||
    message.includes('unauthenticated') ||
    message.includes('not authenticated')
  ) {
    return 'authentication'
  }
  if (status === 429 || message.includes('rate limit') || message.includes('too many')) {
    return 'rate-limit'
  }
  if (status === 403 || (status !== null && status >= 500)) {
    return 'network'
  }
  if (
    status === 400 ||
    status === 422 ||
    message.includes('invalid') ||
    message.includes('validation') ||
    message.includes('argument') ||
    message.includes('variable') ||
    message.includes('must be') ||
    message.includes('cannot')
  ) {
    return 'validation'
  }
  return 'unknown'
}

const ambiguousMutationGraphQLError = (error: GraphQLError): boolean => {
  const status = errorStatus(error)
  return status !== null && status >= 500
}

const graphQLErrorExecution = (
  error: GraphQLError,
): GatewayEntryFailure['execution'] =>
  error.path && error.path.length > 0 ? 'unknown' : 'not-started'

const mutationResultMayHaveExecuted = (
  result: GraphQLResult<unknown>,
  applicableErrors: readonly GraphQLError[],
  hasMutationData: boolean,
): boolean =>
  hasMutationData ||
  result.status >= 500 ||
  (result.data !== null && (result.status < 200 || result.status >= 300)) ||
  applicableErrors.some(
    (error) =>
      graphQLErrorExecution(error) === 'unknown' ||
      ambiguousMutationGraphQLError(error),
  )

const representativeGraphQLError = (
  errors: readonly GraphQLError[],
): GraphQLError | undefined =>
  errors.find((error) => classifyGraphQLError(error) !== 'validation') ??
  errors[0]

const graphQLFailure = (
  entryId: number,
  error: GraphQLError,
  execution: GatewayEntryFailure['execution'] = graphQLErrorExecution(error),
): GatewayEntryFailure => {
  const kind = classifyGraphQLError(error)
  return {
    entryId,
    kind,
    message: error.message,
    retryable: kind === 'rate-limit' || kind === 'network',
    execution,
  }
}

const graphQLMediaFailure = (
  mediaId: number,
  error: GraphQLError,
  execution: GatewayMediaFailure['execution'] = graphQLErrorExecution(error),
): GatewayMediaFailure => {
  const failure = graphQLFailure(mediaId, error, execution)
  return {
    mediaId,
    kind: failure.kind,
    message: failure.message,
    retryable: failure.retryable,
    execution: failure.execution,
  }
}

const transportFailure = (entryId: number, error: unknown): GatewayEntryFailure => {
  if (error instanceof SchedulerCancelledError) {
    return {
      entryId,
      kind: 'cancelled',
      message: error.message,
      retryable: true,
      execution: 'not-started',
    }
  }
  if (error instanceof AniListTransportError) {
    const kind: GatewayFailureKind =
      error.status === 401
        ? 'authentication'
        : error.status === 429
          ? 'rate-limit'
          : error.status === 400 || error.status === 422
            ? 'validation'
            : error.status === undefined ||
                error.status === 403 ||
                (error.status >= 500 && error.status <= 599)
              ? 'network'
              : 'unknown'
    return {
      entryId,
      kind,
      message: error.message,
      retryable: kind === 'rate-limit' || kind === 'network',
      execution: error.ambiguous ? 'unknown' : 'not-started',
    }
  }
  return {
    entryId,
    kind: 'unknown',
    message: error instanceof Error ? error.message : 'Unknown AniList error.',
    retryable: false,
    execution: 'unknown',
  }
}

const transportMediaFailure = (
  mediaId: number,
  error: unknown,
): GatewayMediaFailure => {
  const failure = transportFailure(mediaId, error)
  return {
    mediaId,
    kind: failure.kind,
    message: failure.message,
    retryable: failure.retryable,
    execution: failure.execution,
  }
}

const toCreated = (
  mediaId: number,
  requested: MutableEntryPatch,
  response: RawEntry,
): GatewayCreatedEntry | null => {
  const entryId = asEntryId(response.id)
  const returnedMediaId = asEntryId(response.mediaId)
  if (entryId === null || returnedMediaId !== mediaId) return null
  return {
    entryId,
    mediaId,
    values: { ...requested, ...canonicalValues(response) },
    ...(typeof response.updatedAt === 'number' ? { updatedAt: response.updatedAt } : {}),
  }
}

const directErrorsForAlias = (
  result: GraphQLResult<unknown>,
  alias: string,
): readonly GraphQLError[] =>
  result.errors.filter((error) => error.path?.[0] === alias)

const globalErrors = (result: GraphQLResult<unknown>): readonly GraphQLError[] =>
  result.errors.filter((error) => !error.path || error.path.length === 0)

const allRemainingIds = <T>(
  groups: readonly (readonly T[])[],
  fromIndex: number,
  toId: (value: T) => number,
): number[] => groups.slice(fromIndex).flatMap((group) => group.map(toId))

const zeroStats = (): RateLimitStats => ({
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  retriedRequests: 0,
  rateLimitHits: 0,
  averageResponseTime: 0,
  currentQueueSize: 0,
  limitPerMinute: 30,
  remaining: null,
  resetAt: null,
})

export class AniListBrowserGateway extends AniListReadFacade implements AniListGateway {
  constructor(private readonly transport: GraphQLTransport) {
    super(transport)
  }

  getRateLimitStats(): RateLimitStats {
    const scheduler = (this.transport as { scheduler?: { getStats(): RateLimitStats } })
      .scheduler
    return scheduler?.getStats() ?? zeroStats()
  }

  async readEntries(request: ReadEntriesRequest): Promise<ReadEntriesOutcome> {
    const groups = chunks(uniqueIds(request.entryIds), 10)
    const entries: GatewayEntrySnapshot[] = []
    const missingIds: number[] = []
    const failures: GatewayEntryFailure[] = []
    const unconfirmedIds: number[] = []
    const unattemptedIds: number[] = []

    for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
      const group = groups[groupIndex]!
      if (request.signal?.aborted) {
        unattemptedIds.push(...allRemainingIds(groups, groupIndex, (id) => id))
        break
      }

      const definitions = group.map((_, index) => `$entryId${index}: Int!`).join('\n')
      const aliases = group
        .map(
          (_, index) =>
            `entry${index}: MediaList(id: $entryId${index}) { ${MUTABLE_FIELDS} }`,
        )
        .join('\n')
      const variables = Object.fromEntries(
        group.map((entryId, index) => [`entryId${index}`, entryId]),
      )

      let result: GraphQLResult<Record<string, unknown>>
      try {
        result = await this.transport.execute({
          accountId: request.accountId,
          kind: 'read',
          query: `query ReadMediaListEntries(${definitions}) { ${aliases} }`,
          variables,
          signal: request.signal,
        })
      } catch (error) {
        if (error instanceof SchedulerCancelledError || request.signal?.aborted) {
          unattemptedIds.push(...allRemainingIds(groups, groupIndex, (id) => id))
        } else {
          failures.push(...group.map((entryId) => transportFailure(entryId, error)))
          unattemptedIds.push(...allRemainingIds(groups, groupIndex + 1, (id) => id))
        }
        break
      }

      const data = result.data ?? {}
      group.forEach((entryId, index) => {
        const alias = `entry${index}`
        const aliasErrors = directErrorsForAlias(result, alias)
        if (aliasErrors.length > 0) {
          failures.push(graphQLFailure(entryId, aliasErrors[0]!))
          return
        }
        if (!hasOwn(data, alias)) {
          const globalError = globalErrors(result)[0]
          if (globalError) failures.push(graphQLFailure(entryId, globalError))
          else unconfirmedIds.push(entryId)
          return
        }
        const raw = data[alias]
        if (raw === null) {
          missingIds.push(entryId)
          return
        }
        const record = asRecord(raw)
        if (!record) {
          unconfirmedIds.push(entryId)
          return
        }
        const returnedEntryId = asEntryId(record.id)
        const mediaId = asEntryId(record.mediaId)
        if (returnedEntryId !== entryId || mediaId === null) {
          unconfirmedIds.push(entryId)
          return
        }
        entries.push({
          entryId,
          mediaId,
          values: canonicalValues(record),
          ...(typeof record.updatedAt === 'number' ? { updatedAt: record.updatedAt } : {}),
        })
      })
    }

    return { entries, missingIds, failures, unconfirmedIds, unattemptedIds }
  }

  async readEntriesByMediaIds(
    request: ReadEntriesByMediaIdsRequest,
  ): Promise<ReadEntriesByMediaIdsOutcome> {
    const groups = chunks(uniqueIds(request.mediaIds), 10)
    const entries: GatewayCreatedEntry[] = []
    const missingMediaIds: number[] = []
    const failures: GatewayMediaFailure[] = []
    const unconfirmedMediaIds: number[] = []
    const unattemptedMediaIds: number[] = []

    for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
      const group = groups[groupIndex]!
      if (request.signal?.aborted) {
        unattemptedMediaIds.push(...allRemainingIds(groups, groupIndex, (id) => id))
        break
      }

      const definitions = group.map((_, index) => `$mediaId${index}: Int!`).join('\n')
      const aliases = group
        .map(
          (_, index) =>
            `entry${index}: MediaList(mediaId: $mediaId${index}, userId: $userId) { ${MUTABLE_FIELDS} }`,
        )
        .join('\n')
      const variables: Record<string, unknown> = { userId: request.accountId }
      group.forEach((mediaId, index) => {
        variables[`mediaId${index}`] = mediaId
      })

      let result: GraphQLResult<Record<string, unknown>>
      try {
        result = await this.transport.execute({
          accountId: request.accountId,
          kind: 'read',
          query: `query ReadMediaListEntriesByMedia($userId: Int!, ${definitions}) { ${aliases} }`,
          variables,
          signal: request.signal,
        })
      } catch (error) {
        if (error instanceof SchedulerCancelledError || request.signal?.aborted) {
          unattemptedMediaIds.push(
            ...allRemainingIds(groups, groupIndex, (id) => id),
          )
        } else {
          failures.push(...group.map((mediaId) => transportMediaFailure(mediaId, error)))
          unattemptedMediaIds.push(
            ...allRemainingIds(groups, groupIndex + 1, (id) => id),
          )
        }
        break
      }

      const data = result.data ?? {}
      group.forEach((mediaId, index) => {
        const alias = `entry${index}`
        const aliasErrors = directErrorsForAlias(result, alias)
        if (aliasErrors.length > 0) {
          failures.push(graphQLMediaFailure(mediaId, aliasErrors[0]!))
          return
        }
        if (!hasOwn(data, alias)) {
          const globalError = globalErrors(result)[0]
          if (globalError) failures.push(graphQLMediaFailure(mediaId, globalError))
          else unconfirmedMediaIds.push(mediaId)
          return
        }
        if (data[alias] === null) {
          missingMediaIds.push(mediaId)
          return
        }
        const response = asRecord(data[alias])
        const created = response ? toCreated(mediaId, {}, response) : null
        if (created) entries.push(created)
        else unconfirmedMediaIds.push(mediaId)
      })
    }

    return {
      entries,
      missingMediaIds,
      failures,
      unconfirmedMediaIds,
      unattemptedMediaIds,
    }
  }

  async updateShared(request: UpdateSharedRequest): Promise<GatewayBatchOutcome> {
    const groups = chunks(uniqueIds(request.entryIds), 50)
    const total = groups.reduce((count, group) => count + group.length, 0)
    let attempted = 0
    const outcome = emptyBatch()

    for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
      const group = groups[groupIndex]!
      if (request.signal?.aborted) {
        outcome.unattemptedIds.push(...allRemainingIds(groups, groupIndex, (id) => id))
        break
      }

      let result: GraphQLResult<{ UpdateMediaListEntries?: unknown }>
      try {
        result = await this.transport.execute({
          accountId: request.accountId,
          kind: 'mutation',
          query: SHARED_MUTATION,
          variables: { ids: group, ...mutationVariables(request.values) },
          signal: request.signal,
        })
      } catch (error) {
        const failure = transportFailure(group[0]!, error)
        if (failure.kind === 'cancelled') {
          outcome.unattemptedIds.push(...allRemainingIds(groups, groupIndex, (id) => id))
        } else if (failure.execution === 'unknown') {
          attempted += group.length
          outcome.unconfirmedIds.push(...group)
          outcome.unattemptedIds.push(...allRemainingIds(groups, groupIndex + 1, (id) => id))
        } else {
          attempted += group.length
          outcome.failures.push(...group.map((entryId) => transportFailure(entryId, error)))
          outcome.unattemptedIds.push(...allRemainingIds(groups, groupIndex + 1, (id) => id))
        }
        notifyMutationProgress(request.onProgress, {
          total,
          attempted,
          confirmed: outcome.confirmed.length,
          failed: outcome.failures.length,
          unattempted: total - attempted,
        })
        break
      }

      const returned = Array.isArray(result.data?.UpdateMediaListEntries)
        ? result.data.UpdateMediaListEntries
        : []
      const byId = new Map<number, RawEntry>()
      for (const item of returned) {
        const record = asRecord(item)
        if (!record) continue
        const id = asEntryId(record.id)
        if (id !== null && group.includes(id)) byId.set(id, record)
      }

      const applicableErrors = result.errors.filter(
        (error) =>
          !error.path ||
          error.path.length === 0 ||
          error.path[0] === 'UpdateMediaListEntries',
      )
      const resultMayHaveExecuted = mutationResultMayHaveExecuted(
        result,
        applicableErrors,
        result.data !== null && hasOwn(result.data, 'UpdateMediaListEntries'),
      )

      for (const entryId of group) {
        const record = byId.get(entryId)
        if (record) {
          outcome.confirmed.push(toConfirmed(entryId, request.values, record))
          continue
        }
        const representativeError = representativeGraphQLError(applicableErrors)
        if (!representativeError || resultMayHaveExecuted) {
          outcome.unconfirmedIds.push(entryId)
        } else {
          outcome.failures.push(
            graphQLFailure(entryId, representativeError, 'not-started'),
          )
        }
      }
      attempted += group.length
      notifyMutationProgress(request.onProgress, {
        total,
        attempted,
        confirmed: outcome.confirmed.length,
        failed: outcome.failures.length,
        unattempted: total - attempted,
      })
    }

    return outcome
  }

  async saveEntries(request: SaveEntriesRequest): Promise<GatewayBatchOutcome> {
    const groups = chunks(request.entries, 10)
    const total = groups.reduce((count, group) => count + group.length, 0)
    let attempted = 0
    const outcome = emptyBatch()

    for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
      const group = groups[groupIndex]!
      if (request.signal?.aborted) {
        outcome.unattemptedIds.push(
          ...allRemainingIds(groups, groupIndex, (entry) => entry.target.entryId),
        )
        break
      }

      const { query, variables } = this.buildSaveMutation(group)
      let result: GraphQLResult<Record<string, unknown>>
      try {
        result = await this.transport.execute({
          accountId: request.accountId,
          kind: 'mutation',
          query,
          variables,
          signal: request.signal,
        })
      } catch (error) {
        const failure = transportFailure(group[0]!.target.entryId, error)
        if (failure.kind === 'cancelled') {
          outcome.unattemptedIds.push(
            ...allRemainingIds(groups, groupIndex, (entry) => entry.target.entryId),
          )
        } else if (failure.execution === 'unknown') {
          attempted += group.length
          outcome.unconfirmedIds.push(...group.map((entry) => entry.target.entryId))
          outcome.unattemptedIds.push(
            ...allRemainingIds(groups, groupIndex + 1, (entry) => entry.target.entryId),
          )
        } else {
          attempted += group.length
          outcome.failures.push(
            ...group.map((entry) => transportFailure(entry.target.entryId, error)),
          )
          outcome.unattemptedIds.push(
            ...allRemainingIds(groups, groupIndex + 1, (entry) => entry.target.entryId),
          )
        }
        notifyMutationProgress(request.onProgress, {
          total,
          attempted,
          confirmed: outcome.confirmed.length,
          failed: outcome.failures.length,
          unattempted: total - attempted,
        })
        break
      }

      const data = result.data ?? {}
      const applicableGlobalErrors = globalErrors(result)
      const resultMayHaveExecuted = mutationResultMayHaveExecuted(
        result,
        applicableGlobalErrors,
        Object.keys(data).length > 0,
      )
      group.forEach((entry, index) => {
        const entryId = entry.target.entryId
        const alias = `entry${index}`
        const aliasErrors = directErrorsForAlias(result, alias)
        if (aliasErrors.length > 0) {
          outcome.unconfirmedIds.push(entryId)
          return
        }
        if (!hasOwn(data, alias)) {
          const globalError = representativeGraphQLError(applicableGlobalErrors)
          if (!globalError || resultMayHaveExecuted) {
            outcome.unconfirmedIds.push(entryId)
          } else {
            outcome.failures.push(graphQLFailure(entryId, globalError, 'not-started'))
          }
          return
        }
        const record = asRecord(data[alias])
        if (!record || asEntryId(record.id) !== entryId) {
          outcome.unconfirmedIds.push(entryId)
          return
        }
        outcome.confirmed.push(toConfirmed(entryId, entry.values, record))
      })
      attempted += group.length
      notifyMutationProgress(request.onProgress, {
        total,
        attempted,
        confirmed: outcome.confirmed.length,
        failed: outcome.failures.length,
        unattempted: total - attempted,
      })
    }

    return outcome
  }

  async createEntries(request: CreateEntriesRequest): Promise<GatewayCreateOutcome> {
    const groups = chunks(uniqueCreateInputs(request.entries), 10)
    const total = groups.reduce((count, group) => count + group.length, 0)
    let attempted = 0
    const outcome = emptyCreate()

    for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
      const group = groups[groupIndex]!
      if (request.signal?.aborted) {
        outcome.unattemptedMediaIds.push(
          ...allRemainingIds(groups, groupIndex, (entry) => entry.mediaId),
        )
        break
      }

      const { query, variables } = this.buildCreateMutation(group)
      let result: GraphQLResult<Record<string, unknown>>
      try {
        result = await this.transport.execute({
          accountId: request.accountId,
          kind: 'mutation',
          query,
          variables,
          signal: request.signal,
        })
      } catch (error) {
        const failure = transportMediaFailure(group[0]!.mediaId, error)
        if (failure.kind === 'cancelled') {
          outcome.unattemptedMediaIds.push(
            ...allRemainingIds(groups, groupIndex, (entry) => entry.mediaId),
          )
        } else if (failure.execution === 'unknown') {
          attempted += group.length
          outcome.unconfirmedMediaIds.push(...group.map((entry) => entry.mediaId))
          outcome.unattemptedMediaIds.push(
            ...allRemainingIds(groups, groupIndex + 1, (entry) => entry.mediaId),
          )
        } else {
          attempted += group.length
          outcome.failures.push(
            ...group.map((entry) => transportMediaFailure(entry.mediaId, error)),
          )
          outcome.unattemptedMediaIds.push(
            ...allRemainingIds(groups, groupIndex + 1, (entry) => entry.mediaId),
          )
        }
        notifyMutationProgress(request.onProgress, {
          total,
          attempted,
          confirmed: outcome.confirmed.length,
          failed: outcome.failures.length,
          unattempted: total - attempted,
        })
        break
      }

      const data = result.data ?? {}
      const applicableGlobalErrors = globalErrors(result)
      const resultMayHaveExecuted = mutationResultMayHaveExecuted(
        result,
        applicableGlobalErrors,
        Object.keys(data).length > 0,
      )
      group.forEach((entry, index) => {
        const alias = `entry${index}`
        const aliasErrors = directErrorsForAlias(result, alias)
        if (aliasErrors.length > 0) {
          outcome.unconfirmedMediaIds.push(entry.mediaId)
          return
        }
        if (!hasOwn(data, alias)) {
          const globalError = representativeGraphQLError(applicableGlobalErrors)
          if (!globalError || resultMayHaveExecuted) {
            outcome.unconfirmedMediaIds.push(entry.mediaId)
          } else {
            outcome.failures.push(
              graphQLMediaFailure(entry.mediaId, globalError, 'not-started'),
            )
          }
          return
        }
        const response = asRecord(data[alias])
        const requested: MutableEntryPatch = {
          status: entry.status,
          ...(entry.progress === undefined ? {} : { progress: entry.progress }),
        }
        const created = response ? toCreated(entry.mediaId, requested, response) : null
        if (created) outcome.confirmed.push(created)
        else outcome.unconfirmedMediaIds.push(entry.mediaId)
      })
      attempted += group.length
      notifyMutationProgress(request.onProgress, {
        total,
        attempted,
        confirmed: outcome.confirmed.length,
        failed: outcome.failures.length,
        unattempted: total - attempted,
      })
    }

    return outcome
  }

  async deleteEntries(request: DeleteEntriesRequest): Promise<GatewayBatchOutcome> {
    const groups = chunks(uniqueIds(request.entryIds), 10)
    const total = groups.reduce((count, group) => count + group.length, 0)
    let attempted = 0
    const outcome = emptyBatch()

    for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
      const group = groups[groupIndex]!
      if (request.signal?.aborted) {
        outcome.unattemptedIds.push(...allRemainingIds(groups, groupIndex, (id) => id))
        break
      }
      const definitions = group.map((_, index) => `$entryId${index}: Int!`).join('\n')
      const aliases = group
        .map(
          (_, index) =>
            `entry${index}: DeleteMediaListEntry(id: $entryId${index}) { deleted }`,
        )
        .join('\n')
      const variables = Object.fromEntries(
        group.map((entryId, index) => [`entryId${index}`, entryId]),
      )

      let result: GraphQLResult<Record<string, unknown>>
      try {
        result = await this.transport.execute({
          accountId: request.accountId,
          kind: 'mutation',
          query: `mutation DeleteMediaListEntries(${definitions}) { ${aliases} }`,
          variables,
          signal: request.signal,
        })
      } catch (error) {
        const failure = transportFailure(group[0]!, error)
        if (failure.kind === 'cancelled') {
          outcome.unattemptedIds.push(...allRemainingIds(groups, groupIndex, (id) => id))
        } else if (failure.execution === 'unknown') {
          attempted += group.length
          outcome.unconfirmedIds.push(...group)
          outcome.unattemptedIds.push(...allRemainingIds(groups, groupIndex + 1, (id) => id))
        } else {
          attempted += group.length
          outcome.failures.push(...group.map((entryId) => transportFailure(entryId, error)))
          outcome.unattemptedIds.push(...allRemainingIds(groups, groupIndex + 1, (id) => id))
        }
        notifyMutationProgress(request.onProgress, {
          total,
          attempted,
          confirmed: outcome.confirmed.length + outcome.confirmedDeletedIds.length,
          failed: outcome.failures.length,
          unattempted: total - attempted,
        })
        break
      }

      const data = result.data ?? {}
      const applicableGlobalErrors = globalErrors(result)
      const resultMayHaveExecuted = mutationResultMayHaveExecuted(
        result,
        applicableGlobalErrors,
        Object.keys(data).length > 0,
      )
      group.forEach((entryId, index) => {
        const alias = `entry${index}`
        const aliasErrors = directErrorsForAlias(result, alias)
        if (aliasErrors.length > 0) {
          outcome.unconfirmedIds.push(entryId)
          return
        }
        if (!hasOwn(data, alias)) {
          const globalError = representativeGraphQLError(applicableGlobalErrors)
          if (!globalError || resultMayHaveExecuted) {
            outcome.unconfirmedIds.push(entryId)
          } else {
            outcome.failures.push(graphQLFailure(entryId, globalError, 'not-started'))
          }
          return
        }
        const record = asRecord(data[alias])
        if (record?.deleted === true) outcome.confirmedDeletedIds.push(entryId)
        else if (record?.deleted === false) {
          outcome.failures.push({
            entryId,
            kind: 'unknown',
            message: 'AniList did not confirm this deletion.',
            retryable: false,
            execution: 'completed',
          })
        } else outcome.unconfirmedIds.push(entryId)
      })
      attempted += group.length
      notifyMutationProgress(request.onProgress, {
        total,
        attempted,
        confirmed: outcome.confirmedDeletedIds.length,
        failed: outcome.failures.length,
        unattempted: total - attempted,
      })
    }

    return outcome
  }

  private buildSaveMutation(entries: readonly GatewaySaveRequest[]): {
    query: string
    variables: Record<string, unknown>
  } {
    const definitions = entries
      .map(
        (_, index) => `
          $mediaId${index}: Int!
          $status${index}: MediaListStatus
          $score${index}: Float
          $progress${index}: Int
          $private${index}: Boolean
          $hiddenFromStatusLists${index}: Boolean
          $notes${index}: String
          $customLists${index}: [String]
        `,
      )
      .join('\n')
    const aliases = entries
      .map(
        (_, index) => `
          entry${index}: SaveMediaListEntry(
            mediaId: $mediaId${index}
            status: $status${index}
            score: $score${index}
            progress: $progress${index}
            private: $private${index}
            hiddenFromStatusLists: $hiddenFromStatusLists${index}
            notes: $notes${index}
            customLists: $customLists${index}
          ) { ${MUTABLE_FIELDS} }
        `,
      )
      .join('\n')
    const variables: Record<string, unknown> = {}
    entries.forEach((entry, index) => {
      variables[`mediaId${index}`] = entry.target.mediaId
      const values = mutationVariables(entry.values)
      for (const [name, value] of Object.entries(values)) {
        variables[`${name}${index}`] = value
      }
    })
    return { query: `mutation SaveMediaListEntries(${definitions}) { ${aliases} }`, variables }
  }

  private buildCreateMutation(entries: readonly GatewayCreateInput[]): {
    query: string
    variables: Record<string, unknown>
  } {
    const definitions = entries
      .map(
        (_, index) => `
          $mediaId${index}: Int!
          $status${index}: MediaListStatus!
          $progress${index}: Int
        `,
      )
      .join('\n')
    const aliases = entries
      .map(
        (_, index) => `
          entry${index}: SaveMediaListEntry(
            mediaId: $mediaId${index}
            status: $status${index}
            progress: $progress${index}
          ) { ${MUTABLE_FIELDS} }
        `,
      )
      .join('\n')
    const variables: Record<string, unknown> = {}
    entries.forEach((entry, index) => {
      variables[`mediaId${index}`] = entry.mediaId
      variables[`status${index}`] = entry.status
      if (entry.progress !== undefined) variables[`progress${index}`] = entry.progress
    })
    return {
      query: `mutation CreateMediaListEntries(${definitions}) { ${aliases} }`,
      variables,
    }
  }
}

export const createBrowserAniListGateway = (
  options: AniListFetchTransportOptions,
): AniListBrowserGateway => new AniListBrowserGateway(new AniListFetchTransport(options))
