import type { Media } from '@/types/anilist'

import type {
  AccountId,
  CollectionKey,
  CollectionLoadFailure,
  CollectionLoadRequest,
  CollectionLoadState,
  CollectionSnapshot,
  ConfirmedEntryPatch,
  CreatedMediaListEntry,
  MediaListEntry,
  MediaListEntryId,
  ObservableMediaListWorkspace,
} from './types'

interface CollectionRecord {
  snapshot: CollectionSnapshot
  loadedAt?: number
  activeRequestId?: number
}

const EMPTY_ENTRIES: readonly MediaListEntry[] = Object.freeze([])

function keyOf(key: CollectionKey): string {
  return `${key.accountId}:${key.mediaType}`
}

function copyKey(key: CollectionKey): CollectionKey {
  return { accountId: key.accountId, mediaType: key.mediaType }
}

function mergeMedia(
  existing: Media | undefined,
  incoming: Media | undefined,
): Media | undefined {
  if (!incoming) return existing
  if (!existing) return incoming

  return {
    ...existing,
    ...incoming,
    title: { ...existing.title, ...incoming.title },
    coverImage:
      existing.coverImage || incoming.coverImage
        ? { ...existing.coverImage, ...incoming.coverImage }
        : undefined,
  }
}

/** Merge duplicate collection rows without letting a sparse copy erase rich media. */
function mergeDuplicate(
  existing: MediaListEntry,
  incoming: MediaListEntry,
): MediaListEntry {
  const customListNames = new Set([
    ...Object.keys(existing.customLists ?? {}),
    ...Object.keys(incoming.customLists ?? {}),
  ])
  const customLists =
    customListNames.size === 0
      ? undefined
      : Object.fromEntries(
          [...customListNames].map((name) => [
            name,
            existing.customLists?.[name] === true ||
              incoming.customLists?.[name] === true,
          ]),
        )

  return {
    ...existing,
    ...incoming,
    media: mergeMedia(existing.media, incoming.media),
    customLists,
  }
}

export function deduplicateEntries(
  entries: readonly MediaListEntry[],
): readonly MediaListEntry[] {
  const positions = new Map<MediaListEntryId, number>()
  const result: MediaListEntry[] = []

  for (const current of entries) {
    const position = positions.get(current.id)
    if (position === undefined) {
      positions.set(current.id, result.length)
      result.push(current)
      continue
    }

    const existing = result[position]
    if (existing) result[position] = mergeDuplicate(existing, current)
  }

  return Object.freeze(result)
}

function loadedState(
  entries: readonly MediaListEntry[],
  loadedAt: number,
): CollectionLoadState {
  return entries.length === 0
    ? { status: 'empty', loadedAt }
    : { status: 'ready', loadedAt }
}

function stableState(record: CollectionRecord): CollectionLoadState {
  if (record.loadedAt !== undefined) {
    return loadedState(record.snapshot.entries, record.loadedAt)
  }
  return record.snapshot.loadState.status === 'loading' ||
    record.snapshot.loadState.status === 'refreshing'
    ? { status: 'idle' }
    : record.snapshot.loadState
}

export class InMemoryMediaListWorkspace
  implements ObservableMediaListWorkspace
{
  private readonly collections = new Map<string, CollectionRecord>()
  private readonly listeners = new Set<() => void>()
  private nextRequestId = 1

  getCollection(key: CollectionKey): CollectionSnapshot {
    const storageKey = keyOf(key)
    let record = this.collections.get(storageKey)
    if (!record) {
      record = {
        snapshot: {
          key: copyKey(key),
          entries: EMPTY_ENTRIES,
          loadState: { status: 'idle' },
          revision: 0,
        },
      }
      // A stable idle snapshot is important for React's useSyncExternalStore.
      this.collections.set(storageKey, record)
    }
    return record.snapshot
  }

  replaceCollection(
    key: CollectionKey,
    entries: readonly MediaListEntry[],
    loadedAt: number,
  ): void {
    const storageKey = keyOf(key)
    const previous = this.collections.get(storageKey)
    const canonicalEntries = deduplicateEntries(entries)
    this.collections.set(storageKey, {
      snapshot: {
        key: copyKey(key),
        entries: canonicalEntries,
        loadState: loadedState(canonicalEntries, loadedAt),
        revision: (previous?.snapshot.revision ?? 0) + 1,
      },
      loadedAt,
    })
    this.emit()
  }

  commitConfirmed(
    key: CollectionKey,
    patches: readonly ConfirmedEntryPatch[],
    deletedIds: readonly MediaListEntryId[],
  ): void {
    this.commitJobOutcome(key, patches, deletedIds, [])
  }

  commitCreated(
    key: CollectionKey,
    entries: readonly CreatedMediaListEntry[],
  ): void {
    this.commitJobOutcome(key, [], [], entries)
  }

  commitJobOutcome(
    key: CollectionKey,
    patches: readonly ConfirmedEntryPatch[],
    deletedIds: readonly MediaListEntryId[],
    createdEntries: readonly CreatedMediaListEntry[],
  ): void {
    for (const patch of patches) {
      if (patch.mediaType !== key.mediaType) {
        throw new Error(
          `Confirmed patch media type ${patch.mediaType} does not match collection media type ${key.mediaType}`,
        )
      }
    }
    for (const entry of createdEntries) {
      if (entry.userId !== key.accountId) {
        throw new Error(
          `Created entry account ${entry.userId} does not match collection account ${key.accountId}`,
        )
      }
      if (entry.media.type !== key.mediaType) {
        throw new Error(
          `Created entry media type ${entry.media.type} does not match collection media type ${key.mediaType}`,
        )
      }
    }

    if (
      patches.length === 0 &&
      deletedIds.length === 0 &&
      createdEntries.length === 0
    ) {
      return
    }

    const storageKey = keyOf(key)
    const previous = this.collections.get(storageKey)
    if (!previous) return

    const patchesById = new Map<MediaListEntryId, ConfirmedEntryPatch[]>()
    for (const patch of patches) {
      const entryPatches = patchesById.get(patch.entryId) ?? []
      entryPatches.push(patch)
      patchesById.set(patch.entryId, entryPatches)
    }
    const deleted = new Set(deletedIds)

    const entries = previous.snapshot.entries
      .filter(({ id }) => !deleted.has(id))
      .map((current) => {
        const entryPatches = patchesById.get(current.id)
        if (!entryPatches) return current

        let updated = current
        for (const patch of entryPatches) {
          updated = {
            ...updated,
            ...patch.values,
            ...(patch.updatedAt === undefined
              ? undefined
              : { updatedAt: patch.updatedAt }),
          }
        }
        return updated
      })
    const canonicalEntries = deduplicateEntries([...entries, ...createdEntries])
    const nextRecord: CollectionRecord = {
      snapshot: {
        key: copyKey(key),
        entries: canonicalEntries,
        loadState: previous.snapshot.loadState,
        revision: previous.snapshot.revision + 1,
      },
      loadedAt: previous.loadedAt,
    }
    nextRecord.snapshot = {
      ...nextRecord.snapshot,
      loadState: stableState(nextRecord),
    }
    this.collections.set(storageKey, nextRecord)
    this.emit()
  }

  clearAccount(accountId: AccountId): void {
    let changed = false
    for (const [storageKey, record] of this.collections) {
      if (record.snapshot.key.accountId === accountId) {
        this.collections.delete(storageKey)
        changed = true
      }
    }
    if (changed) this.emit()
  }

  beginLoad(key: CollectionKey): CollectionLoadRequest {
    const storageKey = keyOf(key)
    const previous = this.collections.get(storageKey)
    const requestId = this.nextRequestId++
    const baseRevision = previous?.snapshot.revision ?? 0
    const loadedAt = previous?.loadedAt
    const entries = previous?.snapshot.entries ?? EMPTY_ENTRIES
    const loadState: CollectionLoadState =
      loadedAt === undefined
        ? { status: 'loading' }
        : { status: 'refreshing', loadedAt }

    this.collections.set(storageKey, {
      snapshot: {
        key: copyKey(key),
        entries,
        loadState,
        revision: baseRevision,
      },
      loadedAt,
      activeRequestId: requestId,
    })
    this.emit()
    return { key: copyKey(key), requestId, baseRevision }
  }

  resolveLoad(
    request: CollectionLoadRequest,
    entries: readonly MediaListEntry[],
    loadedAt: number,
  ): boolean {
    const storageKey = keyOf(request.key)
    const record = this.collections.get(storageKey)
    if (
      !record ||
      record.activeRequestId !== request.requestId ||
      record.snapshot.revision !== request.baseRevision
    ) {
      return false
    }

    const canonicalEntries = deduplicateEntries(entries)
    this.collections.set(storageKey, {
      snapshot: {
        key: copyKey(request.key),
        entries: canonicalEntries,
        loadState: loadedState(canonicalEntries, loadedAt),
        revision: record.snapshot.revision + 1,
      },
      loadedAt,
    })
    this.emit()
    return true
  }

  rejectLoad(
    request: CollectionLoadRequest,
    failure: CollectionLoadFailure,
  ): boolean {
    const storageKey = keyOf(request.key)
    const record = this.collections.get(storageKey)
    if (
      !record ||
      record.activeRequestId !== request.requestId ||
      record.snapshot.revision !== request.baseRevision
    ) {
      return false
    }

    const loadState: CollectionLoadState =
      failure.kind === 'offline'
        ? record.loadedAt === undefined
          ? { status: 'offline' }
          : { status: 'offline', loadedAt: record.loadedAt }
        : {
            status: 'error',
            message: failure.message,
            retryable: failure.retryable,
          }

    this.collections.set(storageKey, {
      snapshot: { ...record.snapshot, loadState },
      loadedAt: record.loadedAt,
    })
    this.emit()
    return true
  }

  cancelLoad(request: CollectionLoadRequest): boolean {
    const storageKey = keyOf(request.key)
    const record = this.collections.get(storageKey)
    if (
      !record ||
      record.activeRequestId !== request.requestId ||
      record.snapshot.revision !== request.baseRevision
    ) {
      return false
    }

    this.collections.set(storageKey, {
      snapshot: { ...record.snapshot, loadState: stableState(record) },
      loadedAt: record.loadedAt,
    })
    this.emit()
    return true
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}

export function createMediaListWorkspace(): ObservableMediaListWorkspace {
  return new InMemoryMediaListWorkspace()
}
