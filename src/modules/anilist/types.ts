export type AccountId = number
export type MediaListEntryId = number
export type MediaId = number
export type MediaType = 'ANIME' | 'MANGA'
export type MediaListStatus =
  | 'CURRENT'
  | 'PLANNING'
  | 'COMPLETED'
  | 'DROPPED'
  | 'PAUSED'
  | 'REPEATING'

export interface MutableEntryFields {
  status: MediaListStatus
  score: number
  progress: number
  private: boolean
  hiddenFromStatusLists: boolean
  notes: string
  customLists: Readonly<Record<string, boolean>>
}

export type MutableEntryPatch = Partial<MutableEntryFields>

export interface GatewayEntrySnapshot {
  entryId: MediaListEntryId
  mediaId: MediaId
  values: MutableEntryPatch
  updatedAt?: number
}

export interface GatewaySaveRequest {
  /**
   * A target is obtained from `readEntries`. The adapter, rather than its
   * caller, chooses the AniList identifier required by SaveMediaListEntry.
   */
  target: GatewayEntrySnapshot
  values: MutableEntryPatch
}

export interface GatewayCreateInput {
  mediaId: MediaId
  status: MediaListStatus
  progress?: number
}

export interface GatewayCreatedEntry {
  entryId: MediaListEntryId
  mediaId: MediaId
  values: MutableEntryPatch
  updatedAt?: number
}

export type GatewayFailureKind =
  | 'validation'
  | 'authentication'
  | 'rate-limit'
  | 'network'
  | 'cancelled'
  | 'unknown'

export interface GatewayEntryFailure {
  entryId: MediaListEntryId
  kind: GatewayFailureKind
  message: string
  retryable: boolean
  /** Whether AniList is known not to have started this entry's mutation. */
  execution: 'not-started' | 'unknown' | 'completed'
}

export interface GatewayMediaFailure {
  mediaId: MediaId
  kind: GatewayFailureKind
  message: string
  retryable: boolean
  execution: 'not-started' | 'unknown' | 'completed'
}

export interface GatewayConfirmedPatch {
  entryId: MediaListEntryId
  values: MutableEntryPatch
  updatedAt?: number
}

export interface GatewayBatchOutcome {
  confirmed: readonly GatewayConfirmedPatch[]
  confirmedDeletedIds: readonly MediaListEntryId[]
  failures: readonly GatewayEntryFailure[]
  /** Attempted mutations for which the response did not acknowledge a result. */
  unconfirmedIds: readonly MediaListEntryId[]
  /** Entries for which no mutation request was scheduled. */
  unattemptedIds: readonly MediaListEntryId[]
}

export interface GatewayCreateOutcome {
  confirmed: readonly GatewayCreatedEntry[]
  failures: readonly GatewayMediaFailure[]
  unconfirmedMediaIds: readonly MediaId[]
  unattemptedMediaIds: readonly MediaId[]
}

export interface ReadEntriesByMediaIdsOutcome {
  entries: readonly GatewayCreatedEntry[]
  missingMediaIds: readonly MediaId[]
  failures: readonly GatewayMediaFailure[]
  unconfirmedMediaIds: readonly MediaId[]
  unattemptedMediaIds: readonly MediaId[]
}

export interface ReadEntriesOutcome {
  entries: readonly GatewayEntrySnapshot[]
  /** Explicit null MediaList responses. Useful for verifying deletes. */
  missingIds: readonly MediaListEntryId[]
  failures: readonly GatewayEntryFailure[]
  /** A response omitted the alias, so its state remains unknown. */
  unconfirmedIds: readonly MediaListEntryId[]
  unattemptedIds: readonly MediaListEntryId[]
}

/** Cumulative progress for one gateway mutation call. */
export interface GatewayMutationProgress {
  total: number
  attempted: number
  confirmed: number
  failed: number
  unattempted: number
}

export type GatewayMutationProgressListener = (
  progress: GatewayMutationProgress,
) => void

interface MutationProgressRequest {
  /** Called after each mutation chunk settles. Observer errors are ignored. */
  onProgress?: GatewayMutationProgressListener
}

export interface UpdateSharedRequest extends MutationProgressRequest {
  accountId: AccountId
  entryIds: readonly MediaListEntryId[]
  values: MutableEntryPatch
  signal?: AbortSignal
}

export interface SaveEntriesRequest extends MutationProgressRequest {
  accountId: AccountId
  entries: readonly GatewaySaveRequest[]
  signal?: AbortSignal
}

export interface CreateEntriesRequest extends MutationProgressRequest {
  accountId: AccountId
  entries: readonly GatewayCreateInput[]
  signal?: AbortSignal
}

export interface ReadEntriesByMediaIdsRequest {
  accountId: AccountId
  mediaIds: readonly MediaId[]
  signal?: AbortSignal
}

export interface DeleteEntriesRequest extends MutationProgressRequest {
  accountId: AccountId
  entryIds: readonly MediaListEntryId[]
  signal?: AbortSignal
}

export interface ReadEntriesRequest {
  accountId: AccountId
  entryIds: readonly MediaListEntryId[]
  signal?: AbortSignal
}

export interface FuzzyDate {
  year?: number | null
  month?: number | null
  day?: number | null
}

export interface CollectionMediaTitle {
  userPreferred?: string | null
  romaji?: string | null
  english?: string | null
  native?: string | null
}

export interface CollectionMediaCover {
  large?: string | null
  medium?: string | null
  color?: string | null
}

export interface CollectionMedia {
  id: MediaId
  title: CollectionMediaTitle
  type: MediaType
  format?: string | null
  startDate?: FuzzyDate | null
  seasonYear?: number | null
  episodes?: number | null
  chapters?: number | null
  countryOfOrigin?: string | null
  genres: readonly string[]
  coverImage?: CollectionMediaCover | null
}

export interface MediaListCollectionEntry {
  id: MediaListEntryId
  userId: AccountId
  mediaId: MediaId
  status?: MediaListStatus
  score?: number
  progress?: number
  private?: boolean
  hiddenFromStatusLists?: boolean
  notes?: string
  customLists?: Readonly<Record<string, boolean>>
  startedAt?: FuzzyDate | null
  updatedAt?: number
  media: CollectionMedia
}

export interface LoadMediaListCollectionRequest {
  accountId: AccountId
  mediaType: MediaType
  signal?: AbortSignal
}

export interface MediaListOptionsCatalog {
  animeCustomLists: readonly string[]
  mangaCustomLists: readonly string[]
}

export interface MediaListOptionsCatalogRequest {
  accountId: AccountId
  signal?: AbortSignal
}

export type MediaRelationType = 'PREQUEL' | 'SEQUEL'

export interface RelatedMediaConnection {
  relationType: string
  mediaId: MediaId
  mediaType: MediaType
}

export interface RelatedMediaListEntry {
  entryId: MediaListEntryId
  status?: MediaListStatus
  progress?: number
}

export interface RelatedMediaRecord {
  id: MediaId
  title: CollectionMediaTitle
  type: MediaType
  format?: string | null
  startDate?: FuzzyDate | null
  seasonYear?: number | null
  episodes?: number | null
  chapters?: number | null
  countryOfOrigin?: string | null
  genres: readonly string[]
  coverImage?: CollectionMediaCover | null
  mediaListEntry: RelatedMediaListEntry | null
  relations: readonly RelatedMediaConnection[]
}

export interface ReadMediaRelationsRequest {
  accountId: AccountId
  mediaIds: readonly MediaId[]
  signal?: AbortSignal
}

export interface RelatedSeasonProposal {
  status: 'COMPLETED'
  progress?: number
}

export interface RelatedSeasonPreviewNode {
  id: MediaId
  title: CollectionMediaTitle
  mediaType: MediaType
  format?: string | null
  releaseDate?: FuzzyDate | null
  seasonYear?: number | null
  countryOfOrigin?: string | null
  genres: readonly string[]
  coverImage?: CollectionMediaCover | null
  depth: number
  existingListEntry: RelatedMediaListEntry | null
  proposedAction: RelatedSeasonProposal
  selectedByDefault: boolean
  connections: readonly RelatedMediaConnection[]
}

export interface DiscoverRelatedSeasonsRequest {
  accountId: AccountId
  seedId: MediaId
  mediaType: MediaType
  signal?: AbortSignal
}

export interface RelatedSeasonDiscovery {
  seed: RelatedMediaRecord
  nodes: readonly RelatedSeasonPreviewNode[]
  visitedCount: number
  truncated: boolean
}

export interface RateLimitStats {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  retriedRequests: number
  rateLimitHits: number
  averageResponseTime: number
  currentQueueSize: number
  limitPerMinute: number
  remaining: number | null
  resetAt: number | null
}

export interface AniListGateway {
  loadMediaListCollection(
    request: LoadMediaListCollectionRequest,
  ): Promise<readonly MediaListCollectionEntry[]>
  getMediaListOptionsCatalog(
    request: MediaListOptionsCatalogRequest,
  ): Promise<MediaListOptionsCatalog>
  readMediaRelations(
    request: ReadMediaRelationsRequest,
  ): Promise<readonly RelatedMediaRecord[]>
  discoverRelatedSeasons(
    request: DiscoverRelatedSeasonsRequest,
  ): Promise<RelatedSeasonDiscovery>
  readEntries(request: ReadEntriesRequest): Promise<ReadEntriesOutcome>
  readEntriesByMediaIds(
    request: ReadEntriesByMediaIdsRequest,
  ): Promise<ReadEntriesByMediaIdsOutcome>
  updateShared(request: UpdateSharedRequest): Promise<GatewayBatchOutcome>
  saveEntries(request: SaveEntriesRequest): Promise<GatewayBatchOutcome>
  createEntries(request: CreateEntriesRequest): Promise<GatewayCreateOutcome>
  deleteEntries(request: DeleteEntriesRequest): Promise<GatewayBatchOutcome>
  getRateLimitStats(): RateLimitStats
}

export interface GraphQLErrorLocation {
  line: number
  column: number
}

export interface GraphQLError {
  message: string
  locations?: readonly GraphQLErrorLocation[]
  path?: readonly (string | number)[]
  extensions?: Readonly<Record<string, unknown>>
}

export interface RateLimitHints {
  limit?: number
  remaining?: number
  resetAt?: number
  retryAfterMs?: number
}

export interface GraphQLResult<T> {
  data: T | null
  errors: readonly GraphQLError[]
  status: number
  rateLimit: RateLimitHints
}

export interface GraphQLRequest {
  accountId: AccountId
  kind: 'read' | 'mutation'
  query: string
  variables: Readonly<Record<string, unknown>>
  signal?: AbortSignal
}

export interface GraphQLTransport {
  execute<T>(request: GraphQLRequest): Promise<GraphQLResult<T>>
}

export interface ScheduledResult<T> {
  value: T
  rateLimit?: RateLimitHints
}
