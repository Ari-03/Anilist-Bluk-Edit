import type {
  AniListGateway,
  CreateEntriesRequest,
  DeleteEntriesRequest,
  DiscoverRelatedSeasonsRequest,
  GatewayBatchOutcome,
  GatewayCreateOutcome,
  GatewayCreatedEntry,
  GatewayEntrySnapshot,
  GatewayMutationProgressListener,
  LoadMediaListCollectionRequest,
  MediaListCollectionEntry,
  MediaListOptionsCatalog,
  MediaListOptionsCatalogRequest,
  MutableEntryPatch,
  RateLimitStats,
  ReadMediaRelationsRequest,
  ReadEntriesByMediaIdsOutcome,
  ReadEntriesByMediaIdsRequest,
  ReadEntriesOutcome,
  ReadEntriesRequest,
  RelatedMediaRecord,
  RelatedSeasonDiscovery,
  SaveEntriesRequest,
  UpdateSharedRequest,
} from './types'
import { discoverRelatedSeasonsWithReader } from './read-side'

type GatewayMethod =
  | 'readEntries'
  | 'readEntriesByMediaIds'
  | 'updateShared'
  | 'saveEntries'
  | 'createEntries'
  | 'deleteEntries'

export type DeterministicGatewayCall =
  | { method: 'loadMediaListCollection'; accountId: number; mediaType: string }
  | { method: 'getMediaListOptionsCatalog'; accountId: number }
  | { method: 'readMediaRelations'; accountId: number; mediaIds: readonly number[] }
  | { method: 'discoverRelatedSeasons'; accountId: number; seedId: number; mediaType: string }
  | { method: 'readEntries'; accountId: number; entryIds: readonly number[] }
  | {
      method: 'readEntriesByMediaIds'
      accountId: number
      mediaIds: readonly number[]
    }
  | {
      method: 'updateShared'
      accountId: number
      entryIds: readonly number[]
      values: MutableEntryPatch
    }
  | {
      method: 'saveEntries'
      accountId: number
      entries: SaveEntriesRequest['entries']
    }
  | {
      method: 'createEntries'
      accountId: number
      entries: CreateEntriesRequest['entries']
    }
  | { method: 'deleteEntries'; accountId: number; entryIds: readonly number[] }

type ScriptedOutcome =
  | GatewayBatchOutcome
  | GatewayCreateOutcome
  | ReadEntriesOutcome
  | ReadEntriesByMediaIdsOutcome
  | Error

const cloneValues = (values: MutableEntryPatch): MutableEntryPatch => ({
  ...values,
  ...(values.customLists ? { customLists: { ...values.customLists } } : {}),
})

const cloneEntry = (entry: GatewayEntrySnapshot): GatewayEntrySnapshot => ({
  ...entry,
  values: cloneValues(entry.values),
})

const stats = (): RateLimitStats => ({
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

const notifyMutationProgress = (
  listener: GatewayMutationProgressListener | undefined,
  progress: Parameters<GatewayMutationProgressListener>[0],
): void => {
  if (!listener) return
  try {
    listener(progress)
  } catch {
    // Keep this test seam faithful to the production adapter.
  }
}

const emitBatchProgress = (
  listener: GatewayMutationProgressListener | undefined,
  targetIds: readonly number[],
  chunkSize: number,
  outcome: GatewayBatchOutcome,
): void => {
  const successful = new Set([
    ...outcome.confirmed.map((entry) => entry.entryId),
    ...outcome.confirmedDeletedIds,
  ])
  const failed = new Set(outcome.failures.map((entry) => entry.entryId))
  const unattempted = new Set(outcome.unattemptedIds)

  for (let end = chunkSize; end < targetIds.length + chunkSize; end += chunkSize) {
    const processed = targetIds
      .slice(0, Math.min(end, targetIds.length))
      .filter((id) => !unattempted.has(id))
    if (processed.length === 0) break
    const processedIds = new Set(processed)
    notifyMutationProgress(listener, {
      total: targetIds.length,
      attempted: processed.length,
      confirmed: [...successful].filter((id) => processedIds.has(id)).length,
      failed: [...failed].filter((id) => processedIds.has(id)).length,
      unattempted: targetIds.length - processed.length,
    })
    if (processed.length < Math.min(end, targetIds.length)) break
  }
}

const emitCreateProgress = (
  listener: GatewayMutationProgressListener | undefined,
  targetIds: readonly number[],
  outcome: GatewayCreateOutcome,
): void => {
  const successful = new Set(outcome.confirmed.map((entry) => entry.mediaId))
  const failed = new Set(outcome.failures.map((entry) => entry.mediaId))
  const unattempted = new Set(outcome.unattemptedMediaIds)

  for (let end = 10; end < targetIds.length + 10; end += 10) {
    const processed = targetIds
      .slice(0, Math.min(end, targetIds.length))
      .filter((id) => !unattempted.has(id))
    if (processed.length === 0) break
    const processedIds = new Set(processed)
    notifyMutationProgress(listener, {
      total: targetIds.length,
      attempted: processed.length,
      confirmed: [...successful].filter((id) => processedIds.has(id)).length,
      failed: [...failed].filter((id) => processedIds.has(id)).length,
      unattempted: targetIds.length - processed.length,
    })
    if (processed.length < Math.min(end, targetIds.length)) break
  }
}

/** A deterministic in-memory gateway for unit, integration, and browser mocks. */
export class DeterministicAniListGateway implements AniListGateway {
  readonly calls: DeterministicGatewayCall[] = []
  private readonly entries = new Map<number, GatewayEntrySnapshot>()
  private readonly scripts = new Map<GatewayMethod, ScriptedOutcome[]>()
  private readonly collections = new Map<string, readonly MediaListCollectionEntry[]>()
  private readonly catalogs = new Map<number, MediaListOptionsCatalog>()
  private readonly relatedMedia = new Map<number, RelatedMediaRecord>()
  private nextEntryId = 1

  constructor(initialEntries: readonly GatewayEntrySnapshot[] = []) {
    initialEntries.forEach((entry) => this.setEntry(entry))
  }

  setEntry(entry: GatewayEntrySnapshot): void {
    this.entries.set(entry.entryId, cloneEntry(entry))
    this.nextEntryId = Math.max(this.nextEntryId, entry.entryId + 1)
  }

  setCollection(
    accountId: number,
    mediaType: string,
    entries: readonly MediaListCollectionEntry[],
  ): void {
    this.collections.set(`${accountId}:${mediaType}`, entries)
  }

  setMediaListOptionsCatalog(accountId: number, catalog: MediaListOptionsCatalog): void {
    this.catalogs.set(accountId, catalog)
  }

  setRelatedMedia(media: RelatedMediaRecord): void {
    this.relatedMedia.set(media.id, media)
  }

  enqueue(method: GatewayMethod, outcome: ScriptedOutcome): void {
    const queue = this.scripts.get(method) ?? []
    queue.push(outcome)
    this.scripts.set(method, queue)
  }

  getRateLimitStats(): RateLimitStats {
    return stats()
  }

  async loadMediaListCollection(
    request: LoadMediaListCollectionRequest,
  ): Promise<readonly MediaListCollectionEntry[]> {
    this.calls.push({
      method: 'loadMediaListCollection',
      accountId: request.accountId,
      mediaType: request.mediaType,
    })
    return this.collections.get(`${request.accountId}:${request.mediaType}`) ?? []
  }

  async getMediaListOptionsCatalog(
    request: MediaListOptionsCatalogRequest,
  ): Promise<MediaListOptionsCatalog> {
    this.calls.push({ method: 'getMediaListOptionsCatalog', accountId: request.accountId })
    return (
      this.catalogs.get(request.accountId) ?? {
        animeCustomLists: [],
        mangaCustomLists: [],
      }
    )
  }

  async readMediaRelations(
    request: ReadMediaRelationsRequest,
  ): Promise<readonly RelatedMediaRecord[]> {
    this.calls.push({
      method: 'readMediaRelations',
      accountId: request.accountId,
      mediaIds: [...request.mediaIds],
    })
    return request.mediaIds.flatMap((id) => {
      const item = this.relatedMedia.get(id)
      return item ? [item] : []
    })
  }

  async discoverRelatedSeasons(
    request: DiscoverRelatedSeasonsRequest,
  ): Promise<RelatedSeasonDiscovery> {
    this.calls.push({
      method: 'discoverRelatedSeasons',
      accountId: request.accountId,
      seedId: request.seedId,
      mediaType: request.mediaType,
    })
    return discoverRelatedSeasonsWithReader(request, (readRequest) =>
      this.readMediaRelations(readRequest),
    )
  }

  async readEntries(request: ReadEntriesRequest): Promise<ReadEntriesOutcome> {
    this.calls.push({
      method: 'readEntries',
      accountId: request.accountId,
      entryIds: [...request.entryIds],
    })
    const scripted = this.take<ReadEntriesOutcome>('readEntries')
    if (scripted) return scripted
    if (request.signal?.aborted) {
      return {
        entries: [],
        missingIds: [],
        failures: [],
        unconfirmedIds: [],
        unattemptedIds: [...request.entryIds],
      }
    }

    const found: GatewayEntrySnapshot[] = []
    const missingIds: number[] = []
    for (const entryId of request.entryIds) {
      const entry = this.entries.get(entryId)
      if (entry) found.push(cloneEntry(entry))
      else missingIds.push(entryId)
    }
    return {
      entries: found,
      missingIds,
      failures: [],
      unconfirmedIds: [],
      unattemptedIds: [],
    }
  }

  async readEntriesByMediaIds(
    request: ReadEntriesByMediaIdsRequest,
  ): Promise<ReadEntriesByMediaIdsOutcome> {
    this.calls.push({
      method: 'readEntriesByMediaIds',
      accountId: request.accountId,
      mediaIds: [...request.mediaIds],
    })
    const scripted = this.take<ReadEntriesByMediaIdsOutcome>('readEntriesByMediaIds')
    if (scripted) return scripted
    if (request.signal?.aborted) {
      return {
        entries: [],
        missingMediaIds: [],
        failures: [],
        unconfirmedMediaIds: [],
        unattemptedMediaIds: [...request.mediaIds],
      }
    }

    const entriesByMediaId = new Map(
      [...this.entries.values()].map((entry) => [entry.mediaId, entry]),
    )
    const entries: GatewayCreatedEntry[] = []
    const missingMediaIds: number[] = []
    request.mediaIds.forEach((mediaId) => {
      const entry = entriesByMediaId.get(mediaId)
      if (entry) entries.push(cloneEntry(entry))
      else missingMediaIds.push(mediaId)
    })
    return {
      entries,
      missingMediaIds,
      failures: [],
      unconfirmedMediaIds: [],
      unattemptedMediaIds: [],
    }
  }

  async updateShared(request: UpdateSharedRequest): Promise<GatewayBatchOutcome> {
    this.calls.push({
      method: 'updateShared',
      accountId: request.accountId,
      entryIds: [...request.entryIds],
      values: cloneValues(request.values),
    })
    const scripted = this.take<GatewayBatchOutcome>('updateShared')
    if (scripted) {
      emitBatchProgress(request.onProgress, request.entryIds, 50, scripted)
      return scripted
    }

    if (request.signal?.aborted) {
      return {
        confirmed: [],
        confirmedDeletedIds: [],
        failures: [],
        unconfirmedIds: [],
        unattemptedIds: [...request.entryIds],
      }
    }

    const confirmed: GatewayBatchOutcome['confirmed'][number][] = []
    const failures: GatewayBatchOutcome['failures'][number][] = []
    for (const entryId of request.entryIds) {
      const current = this.entries.get(entryId)
      if (!current) {
        failures.push({
          entryId,
          kind: 'validation',
          message: 'Media-list entry does not exist.',
          retryable: false,
          execution: 'not-started',
        })
        continue
      }
      const updated = {
        ...current,
        values: { ...current.values, ...cloneValues(request.values) },
      }
      this.entries.set(entryId, updated)
      confirmed.push({ entryId, values: cloneValues(updated.values) })
    }
    const outcome: GatewayBatchOutcome = {
      confirmed,
      confirmedDeletedIds: [],
      failures,
      unconfirmedIds: [],
      unattemptedIds: [],
    }
    emitBatchProgress(request.onProgress, request.entryIds, 50, outcome)
    return outcome
  }

  async saveEntries(request: SaveEntriesRequest): Promise<GatewayBatchOutcome> {
    const copiedEntries = request.entries.map((entry) => ({
      target: cloneEntry(entry.target),
      values: cloneValues(entry.values),
    }))
    this.calls.push({
      method: 'saveEntries',
      accountId: request.accountId,
      entries: copiedEntries,
    })
    const scripted = this.take<GatewayBatchOutcome>('saveEntries')
    const targetIds = copiedEntries.map((entry) => entry.target.entryId)
    if (scripted) {
      emitBatchProgress(request.onProgress, targetIds, 10, scripted)
      return scripted
    }

    if (request.signal?.aborted) {
      return {
        confirmed: [],
        confirmedDeletedIds: [],
        failures: [],
        unconfirmedIds: [],
        unattemptedIds: targetIds,
      }
    }

    const confirmed = copiedEntries.map((entry) => {
      const updated: GatewayEntrySnapshot = {
        ...entry.target,
        values: { ...entry.target.values, ...entry.values },
      }
      this.entries.set(updated.entryId, updated)
      return { entryId: updated.entryId, values: cloneValues(updated.values) }
    })
    const outcome: GatewayBatchOutcome = {
      confirmed,
      confirmedDeletedIds: [],
      failures: [],
      unconfirmedIds: [],
      unattemptedIds: [],
    }
    emitBatchProgress(request.onProgress, targetIds, 10, outcome)
    return outcome
  }

  async createEntries(request: CreateEntriesRequest): Promise<GatewayCreateOutcome> {
    const copiedEntries = request.entries.map((entry) => ({ ...entry }))
    this.calls.push({
      method: 'createEntries',
      accountId: request.accountId,
      entries: copiedEntries,
    })
    const scripted = this.take<GatewayCreateOutcome>('createEntries')
    const targetIds = copiedEntries.map((entry) => entry.mediaId)
    if (scripted) {
      emitCreateProgress(request.onProgress, targetIds, scripted)
      return scripted
    }
    if (request.signal?.aborted) {
      return {
        confirmed: [],
        failures: [],
        unconfirmedMediaIds: [],
        unattemptedMediaIds: targetIds,
      }
    }

    const confirmed = copiedEntries.map((entry) => {
      const existing = [...this.entries.values()].find(
        (candidate) => candidate.mediaId === entry.mediaId,
      )
      const created: GatewayEntrySnapshot = {
        entryId: existing?.entryId ?? this.nextEntryId++,
        mediaId: entry.mediaId,
        values: {
          ...existing?.values,
          status: entry.status,
          ...(entry.progress === undefined ? {} : { progress: entry.progress }),
        },
      }
      this.entries.set(created.entryId, created)
      return cloneEntry(created)
    })
    const outcome: GatewayCreateOutcome = {
      confirmed,
      failures: [],
      unconfirmedMediaIds: [],
      unattemptedMediaIds: [],
    }
    emitCreateProgress(request.onProgress, targetIds, outcome)
    return outcome
  }

  async deleteEntries(request: DeleteEntriesRequest): Promise<GatewayBatchOutcome> {
    this.calls.push({
      method: 'deleteEntries',
      accountId: request.accountId,
      entryIds: [...request.entryIds],
    })
    const scripted = this.take<GatewayBatchOutcome>('deleteEntries')
    if (scripted) {
      emitBatchProgress(request.onProgress, request.entryIds, 10, scripted)
      return scripted
    }

    if (request.signal?.aborted) {
      return {
        confirmed: [],
        confirmedDeletedIds: [],
        failures: [],
        unconfirmedIds: [],
        unattemptedIds: [...request.entryIds],
      }
    }

    const confirmedDeletedIds: number[] = []
    const failures: GatewayBatchOutcome['failures'][number][] = []
    request.entryIds.forEach((entryId) => {
      if (this.entries.delete(entryId)) confirmedDeletedIds.push(entryId)
      else {
        failures.push({
          entryId,
          kind: 'validation',
          message: 'Media-list entry does not exist.',
          retryable: false,
          execution: 'not-started',
        })
      }
    })
    const outcome: GatewayBatchOutcome = {
      confirmed: [],
      confirmedDeletedIds,
      failures,
      unconfirmedIds: [],
      unattemptedIds: [],
    }
    emitBatchProgress(request.onProgress, request.entryIds, 10, outcome)
    return outcome
  }

  private take<
    T extends
      | GatewayBatchOutcome
      | GatewayCreateOutcome
      | ReadEntriesOutcome
      | ReadEntriesByMediaIdsOutcome,
  >(
    method: GatewayMethod,
  ): T | null {
    const next = this.scripts.get(method)?.shift()
    if (!next) return null
    if (next instanceof Error) throw next
    return next as T
  }
}
