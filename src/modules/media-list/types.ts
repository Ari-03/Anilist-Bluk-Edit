import type {
  MediaFormat,
  MediaList,
  MediaListStatus,
} from '@/types/anilist'

export type AccountId = number
export type MediaType = 'ANIME' | 'MANGA'
export type MediaListEntryId = number
export type MediaId = number
export type MediaListEntry = MediaList
export type CreatedMediaListEntry = MediaListEntry & {
  media: NonNullable<MediaListEntry['media']>
}

export interface CollectionKey {
  accountId: AccountId
  mediaType: MediaType
}

/** Fields that a SaveMediaListEntry response can authoritatively reconcile. */
export interface MutableEntryFields {
  status?: MediaListStatus
  score?: number
  progress?: number
  private?: boolean
  hiddenFromStatusLists?: boolean
  notes?: string
  customLists?: Record<string, boolean>
}

export interface ConfirmedEntryPatch {
  entryId: MediaListEntryId
  mediaType: MediaType
  values: Partial<MutableEntryFields>
  updatedAt?: number
}

export type CollectionLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; loadedAt: number }
  | { status: 'empty'; loadedAt: number }
  | { status: 'refreshing'; loadedAt: number }
  | { status: 'error'; message: string; retryable: boolean }
  | { status: 'offline'; loadedAt?: number }

export interface CollectionSnapshot {
  key: CollectionKey
  entries: readonly MediaListEntry[]
  loadState: CollectionLoadState
  /**
   * Monotonically increases whenever canonical entries change. A request captures
   * this value so an older collection response cannot overwrite a confirmed edit.
   */
  revision: number
}

export interface CollectionLoadRequest {
  key: CollectionKey
  requestId: number
  baseRevision: number
}

export type CollectionLoadFailure =
  | { kind: 'offline' }
  | { kind: 'error'; message: string; retryable: boolean }

export interface MediaListWorkspace {
  replaceCollection(
    key: CollectionKey,
    entries: readonly MediaListEntry[],
    loadedAt: number,
  ): void
  commitConfirmed(
    key: CollectionKey,
    patches: readonly ConfirmedEntryPatch[],
    deletedIds: readonly MediaListEntryId[],
  ): void
  commitCreated(
    key: CollectionKey,
    entries: readonly CreatedMediaListEntry[],
  ): void
  commitJobOutcome(
    key: CollectionKey,
    patches: readonly ConfirmedEntryPatch[],
    deletedIds: readonly MediaListEntryId[],
    createdEntries: readonly CreatedMediaListEntry[],
  ): void
  clearAccount(accountId: AccountId): void
}

export interface ObservableMediaListWorkspace extends MediaListWorkspace {
  getCollection(key: CollectionKey): CollectionSnapshot
  beginLoad(key: CollectionKey): CollectionLoadRequest
  resolveLoad(
    request: CollectionLoadRequest,
    entries: readonly MediaListEntry[],
    loadedAt: number,
  ): boolean
  rejectLoad(
    request: CollectionLoadRequest,
    failure: CollectionLoadFailure,
  ): boolean
  cancelLoad(request: CollectionLoadRequest): boolean
  subscribe(listener: () => void): () => void
}

export interface ListQuery {
  statuses: readonly MediaListStatus[]
  customLists: readonly string[]
  formats: readonly MediaFormat[]
  genres: readonly string[]
  countries: readonly string[]
  year: { min?: number; max?: number }
  score: { min?: number; max?: number }
  search: string
  sort: {
    field: 'title' | 'score' | 'progress' | 'startedAt' | 'updatedAt'
    direction: 'asc' | 'desc'
  }
  page: number
  pageSize: 50 | 100 | 250
  /** AniList's hidden status-list entries remain hidden by default. */
  includeHidden?: boolean
}

export interface ListProjection {
  entries: readonly MediaListEntry[]
  totalEntries: number
  page: number
  pageCount: number
}

export interface ScopedSelection {
  scope: string
  entryIds: ReadonlySet<MediaListEntryId>
}
