import type {
  AccountId,
  MediaListStatus,
  MediaType,
  MutableEntryFields,
  RateLimitStats,
} from '../anilist'

export type { AccountId, MediaListStatus, MediaType, RateLimitStats }

export type MediaListEntryId = number

export type FieldEdit<T> =
  | { kind: 'unchanged' }
  | { kind: 'set'; value: T }

export interface BulkChanges {
  status: FieldEdit<MediaListStatus>
  score: FieldEdit<number>
  progress: FieldEdit<number>
  private: FieldEdit<boolean>
  hiddenFromStatusLists: FieldEdit<boolean>
  notes: FieldEdit<string>
  customLists: Readonly<Record<string, 'keep' | 'add' | 'remove'>>
}

export interface BulkEditCommand {
  accountId: AccountId
  mediaType: MediaType
  entryIds: readonly MediaListEntryId[]
  changes: BulkChanges
  operation?: 'update'
}

export interface BulkDeleteCommand {
  accountId: AccountId
  mediaType: MediaType
  entryIds: readonly MediaListEntryId[]
  operation: 'delete'
}

export interface BulkCreateEntryInput {
  mediaId: number
  status: MediaListStatus
  progress?: number
}

export interface BulkCreateCommand {
  accountId: AccountId
  mediaType: MediaType
  operation: 'create'
  entries: readonly BulkCreateEntryInput[]
}

/** Existing edit/delete command union retained for UI compatibility. */
export type BulkJobCommand = BulkEditCommand | BulkDeleteCommand
export type BulkRunnerCommand = BulkJobCommand | BulkCreateCommand

export interface ConfirmedEntryPatch {
  entryId: MediaListEntryId
  mediaType: MediaType
  values: Partial<MutableEntryFields>
  updatedAt?: number
}

export interface EntryFailure {
  entryId: MediaListEntryId
  kind:
    | 'validation'
    | 'authentication'
    | 'rate-limit'
    | 'network'
    | 'cancelled'
    | 'unknown'
  message: string
  retryable: boolean
  /** Verification can remain ambiguous even when the read confirms token expiry. */
  authenticationConfirmed?: boolean
}

export interface CreationFailure {
  mediaId: number
  kind: EntryFailure['kind']
  message: string
  retryable: boolean
  authenticationConfirmed?: boolean
}

export interface ConfirmedCreatedEntry {
  entryId: MediaListEntryId
  mediaId: number
  mediaType: MediaType
  values: Partial<MutableEntryFields>
  updatedAt?: number
}

export interface BulkJobOutcome {
  status: 'completed' | 'partial' | 'cancelled' | 'failed' | 'unknown'
  confirmedPatches: readonly ConfirmedEntryPatch[]
  confirmedDeletedIds: readonly MediaListEntryId[]
  confirmedCreatedEntries?: readonly ConfirmedCreatedEntry[]
  failures: readonly EntryFailure[]
  creationFailures?: readonly CreationFailure[]
  unattemptedIds: readonly MediaListEntryId[]
  unattemptedMediaIds?: readonly number[]
  stats: RateLimitStats
}

export interface BulkCreateJobOutcome extends BulkJobOutcome {
  confirmedCreatedEntries: readonly ConfirmedCreatedEntry[]
  creationFailures: readonly CreationFailure[]
  unattemptedMediaIds: readonly number[]
}

export type BulkJobPhase =
  | 'preparing'
  | 'preflight'
  | 'mutating'
  | 'verifying'
  | 'completed'

export interface BulkJobProgress {
  phase: BulkJobPhase
  total: number
  attempted: number
  confirmed: number
  failed: number
  unattempted: number
  stats: RateLimitStats
}

export interface BulkJobHandle<
  Outcome extends BulkJobOutcome = BulkJobOutcome,
> {
  cancel(): void
  subscribe(listener: (progress: BulkJobProgress) => void): () => void
  result: Promise<Outcome>
}

export interface BulkEditRunner {
  start(command: BulkCreateCommand): BulkJobHandle<BulkCreateJobOutcome>
  start(command: BulkRunnerCommand): BulkJobHandle
}
