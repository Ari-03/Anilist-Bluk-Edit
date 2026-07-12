import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import dynamic from 'next/dynamic'

import { AccountControls } from '@/components/accounts/AccountControls'
import type { BulkEditDialogProps } from '@/components/bulk'
import type { RelatedSeasonsDialogProps } from '@/components/related'
import { useNotifications } from '@/components/ui'
import {
  MediaWorkspaceView,
  preloadMediaListMotion,
  type FilterOptions,
} from '@/components/workspace'
import { useApp } from '@/contexts/AppContext'
import { useWorkspaceCollection } from '@/hooks/useWorkspaceCollection'
import {
  queryFromPreferences,
  queryToPreferences,
  viewModeFromPreferences,
} from '@/lib/list-preferences'
import { retryCountSince, trackBulkJobOutcome } from '@/lib/privacy-analytics'
import type { AccountSummary } from '@/modules/accounts'
import {
  AniListGatewayError,
  type AniListGateway,
  type MediaId,
  type MediaListCollectionEntry,
  type MediaListOptionsCatalog,
  type MutableEntryPatch,
  type RelatedSeasonDiscovery,
  type RelatedSeasonPreviewNode,
} from '@/modules/anilist'
import {
  combineBulkJobOutcomes,
  createBulkEditRunner,
  hasAmbiguousResults,
  retryableEntryIds,
  retryableMediaIds,
  setTo,
  unchanged,
  verifyAmbiguousResults,
  type BulkChanges,
  type BulkJobCommand,
  type BulkJobHandle,
  type BulkJobOutcome,
  type BulkJobProgress,
  type BulkRunnerCommand,
  type ConfirmedCreatedEntry,
} from '@/modules/bulk-edit'
import {
  createDefaultListQuery,
  createListQueryFingerprint,
  createScopedSelection,
  projectListWithIds,
  reconcileSelectionScope,
  selectEntryIds,
  toggleSelectedEntry,
  type ConfirmedEntryPatch,
  type CollectionKey,
  type CreatedMediaListEntry,
  type ListQuery,
  type MediaListEntryId,
  type MediaType,
  type ScopedSelection,
} from '@/modules/media-list'
import {
  MediaFormat,
  type FuzzyDate,
  type MediaCoverImage,
  type MediaList,
  type MediaTitle,
} from '@/types/anilist'

const FIVE_MINUTES = 5 * 60 * 1_000
const knownFormats = new Set<string>(Object.values(MediaFormat))

const BulkEditDialog = dynamic<BulkEditDialogProps>(
  () =>
    import('@/components/bulk/BulkEditDialog').then(
      (module) => module.BulkEditDialog,
    ),
  { ssr: false },
)

const RelatedSeasonsDialog = dynamic<RelatedSeasonsDialogProps>(
  () =>
    import('@/components/related/RelatedSeasonsDialog').then(
      (module) => module.RelatedSeasonsDialog,
    ),
  { ssr: false },
)

type CatalogState =
  | { status: 'loading'; catalog: MediaListOptionsCatalog | null; loadedAt?: number }
  | { status: 'ready'; catalog: MediaListOptionsCatalog; loadedAt: number }
  | { status: 'error'; catalog: MediaListOptionsCatalog | null; loadedAt?: number }

const EMPTY_CATALOG: MediaListOptionsCatalog = {
  animeCustomLists: [],
  mangaCustomLists: [],
}

function cleanDate(value: {
  year?: number | null
  month?: number | null
  day?: number | null
} | null | undefined): FuzzyDate | undefined {
  if (!value) return undefined
  return {
    ...(typeof value.year === 'number' ? { year: value.year } : {}),
    ...(typeof value.month === 'number' ? { month: value.month } : {}),
    ...(typeof value.day === 'number' ? { day: value.day } : {}),
  }
}

function cleanTitle(value: {
  userPreferred?: string | null
  romaji?: string | null
  english?: string | null
  native?: string | null
}): MediaTitle {
  return {
    ...(typeof value.userPreferred === 'string'
      ? { userPreferred: value.userPreferred }
      : {}),
    ...(typeof value.romaji === 'string' ? { romaji: value.romaji } : {}),
    ...(typeof value.english === 'string' ? { english: value.english } : {}),
    ...(typeof value.native === 'string' ? { native: value.native } : {}),
  }
}

function cleanCover(value: {
  large?: string | null
  medium?: string | null
  color?: string | null
} | null | undefined): MediaCoverImage | undefined {
  if (!value) return undefined
  return {
    ...(typeof value.large === 'string' ? { large: value.large } : {}),
    ...(typeof value.medium === 'string' ? { medium: value.medium } : {}),
    ...(typeof value.color === 'string' ? { color: value.color } : {}),
  }
}

function toWorkspaceEntry(entry: MediaListCollectionEntry): MediaList {
  const format =
    typeof entry.media.format === 'string' && knownFormats.has(entry.media.format)
      ? (entry.media.format as MediaFormat)
      : undefined
  const startDate = cleanDate(entry.media.startDate)
  const startedAt = cleanDate(entry.startedAt)
  const coverImage = cleanCover(entry.media.coverImage)

  return {
    id: entry.id,
    userId: entry.userId,
    mediaId: entry.mediaId,
    ...(entry.status === undefined ? {} : { status: entry.status }),
    ...(entry.score === undefined ? {} : { score: entry.score }),
    ...(entry.progress === undefined ? {} : { progress: entry.progress }),
    ...(entry.private === undefined ? {} : { private: entry.private }),
    ...(entry.notes === undefined ? {} : { notes: entry.notes }),
    ...(entry.hiddenFromStatusLists === undefined
      ? {}
      : { hiddenFromStatusLists: entry.hiddenFromStatusLists }),
    ...(entry.customLists === undefined
      ? {}
      : { customLists: { ...entry.customLists } }),
    ...(startedAt ? { startedAt } : {}),
    ...(entry.updatedAt === undefined ? {} : { updatedAt: entry.updatedAt }),
    media: {
      id: entry.media.id,
      title: cleanTitle(entry.media.title),
      type: entry.media.type,
      ...(format ? { format } : {}),
      ...(startDate ? { startDate } : {}),
      ...(typeof entry.media.seasonYear === 'number'
        ? { seasonYear: entry.media.seasonYear }
        : {}),
      ...(typeof entry.media.episodes === 'number'
        ? { episodes: entry.media.episodes }
        : {}),
      ...(typeof entry.media.chapters === 'number'
        ? { chapters: entry.media.chapters }
        : {}),
      ...(typeof entry.media.countryOfOrigin === 'string'
        ? { countryOfOrigin: entry.media.countryOfOrigin }
        : {}),
      genres: [...entry.media.genres],
      ...(coverImage ? { coverImage } : {}),
    },
  }
}

function toWorkspaceValues(values: MutableEntryPatch): ConfirmedEntryPatch['values'] {
  const result: ConfirmedEntryPatch['values'] = {}
  if (Object.hasOwn(values, 'status') && values.status !== null) result.status = values.status
  if (Object.hasOwn(values, 'score') && values.score !== undefined) result.score = values.score
  if (Object.hasOwn(values, 'progress') && values.progress !== undefined) {
    result.progress = values.progress
  }
  if (Object.hasOwn(values, 'private') && values.private !== undefined) {
    result.private = values.private
  }
  if (
    Object.hasOwn(values, 'hiddenFromStatusLists') &&
    values.hiddenFromStatusLists !== undefined
  ) {
    result.hiddenFromStatusLists = values.hiddenFromStatusLists
  }
  if (Object.hasOwn(values, 'notes')) result.notes = values.notes ?? ''
  if (Object.hasOwn(values, 'customLists') && values.customLists) {
    result.customLists = { ...values.customLists }
  }
  return result
}

function workspacePatches(outcome: BulkJobOutcome): ConfirmedEntryPatch[] {
  return outcome.confirmedPatches.map((patch) => ({
    entryId: patch.entryId,
    mediaType: patch.mediaType,
    values: toWorkspaceValues(patch.values),
    ...(patch.updatedAt === undefined ? {} : { updatedAt: patch.updatedAt }),
  }))
}

function titleFor(entry: MediaList | undefined): string {
  return (
    entry?.media?.title.userPreferred ??
    entry?.media?.title.english ??
    entry?.media?.title.romaji ??
    'this entry'
  )
}

function createdWorkspaceEntry(
  created: ConfirmedCreatedEntry,
  node: RelatedSeasonPreviewNode,
  accountId: number,
): CreatedMediaListEntry {
  const format =
    typeof node.format === 'string' && knownFormats.has(node.format)
      ? (node.format as MediaFormat)
      : undefined
  const startDate = cleanDate(node.releaseDate)
  const coverImage = cleanCover(node.coverImage)
  const maximum = node.proposedAction.progress
  const status = created.values.status ?? node.proposedAction.status

  return {
    id: created.entryId,
    userId: accountId,
    mediaId: created.mediaId,
    ...(status === null ? {} : { status }),
    ...(created.values.score === undefined ? {} : { score: created.values.score }),
    ...(created.values.progress === undefined
      ? {}
      : { progress: created.values.progress }),
    ...(created.values.private === undefined
      ? {}
      : { private: created.values.private }),
    ...(created.values.hiddenFromStatusLists === undefined
      ? {}
      : { hiddenFromStatusLists: created.values.hiddenFromStatusLists }),
    ...(created.values.notes === undefined
      ? {}
      : { notes: created.values.notes ?? '' }),
    ...(created.values.customLists
      ? { customLists: { ...created.values.customLists } }
      : {}),
    ...(created.updatedAt === undefined ? {} : { updatedAt: created.updatedAt }),
    media: {
      id: node.id,
      title: cleanTitle(node.title),
      type: node.mediaType,
      ...(format ? { format } : {}),
      ...(startDate ? { startDate } : {}),
      ...(typeof node.seasonYear === 'number'
        ? { seasonYear: node.seasonYear }
        : {}),
      ...(typeof maximum === 'number' && node.mediaType === 'ANIME'
        ? { episodes: maximum }
        : {}),
      ...(typeof maximum === 'number' && node.mediaType === 'MANGA'
        ? { chapters: maximum }
        : {}),
      ...(typeof node.countryOfOrigin === 'string'
        ? { countryOfOrigin: node.countryOfOrigin }
        : {}),
      genres: [...node.genres],
      ...(coverImage ? { coverImage } : {}),
    },
  }
}

export interface WorkspaceApplicationProps {
  account: AccountSummary
}

export function WorkspaceApplication({ account }: WorkspaceApplicationProps) {
  const { aniListGateway } = useApp()
  if (!aniListGateway) return null
  return <ReadyWorkspace account={account} gateway={aniListGateway} />
}

function ReadyWorkspace({
  account,
  gateway,
}: WorkspaceApplicationProps & { gateway: AniListGateway }) {
  const {
    workspace,
    preferences,
    jobRunning,
    setJobRunning,
    markReauthenticationRequired,
  } = useApp()
  const { enqueue } = useNotifications()
  const [mediaType, setMediaType] = useState<MediaType>('ANIME')
  const [queries, setQueries] = useState<Record<MediaType, ListQuery>>(() => ({
    ANIME: createDefaultListQuery(),
    MANGA: createDefaultListQuery(),
  }))
  const [viewModes, setViewModes] = useState<Record<MediaType, 'grid' | 'list'>>({
    ANIME: 'grid',
    MANGA: 'grid',
  })
  const [motionReady, setMotionReady] = useState(false)
  const [selection, setSelection] = useState<ScopedSelection>(() =>
    createScopedSelection(
      { accountId: account.id, mediaType: 'ANIME' },
      createDefaultListQuery(),
    ),
  )
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false)
  const [bulkDialogMode, setBulkDialogMode] = useState<'edit' | 'delete'>('edit')
  const [bulkProgress, setBulkProgress] = useState<BulkJobProgress | null>(null)
  const [bulkOutcome, setBulkOutcome] = useState<BulkJobOutcome | null>(null)
  const [bulkActionError, setBulkActionError] = useState<string | null>(null)
  const [catalogState, setCatalogState] = useState<CatalogState>({
    status: 'loading',
    catalog: null,
  })
  const catalogStateRef = useRef<CatalogState>(catalogState)
  const catalogRequestId = useRef(0)
  const [manualRefreshing, setManualRefreshing] = useState(false)
  const [relatedOpen, setRelatedOpen] = useState(false)
  const [relatedLoading, setRelatedLoading] = useState(false)
  const [relatedError, setRelatedError] = useState<string | null>(null)
  const [relatedDiscovery, setRelatedDiscovery] =
    useState<RelatedSeasonDiscovery | null>(null)
  const [relatedSelected, setRelatedSelected] = useState<ReadonlySet<MediaId>>(
    new Set(),
  )
  const [relatedOutcome, setRelatedOutcome] = useState<BulkJobOutcome | null>(null)
  const [relatedActionError, setRelatedActionError] = useState<string | null>(null)
  const [relatedProgress, setRelatedProgress] = useState<BulkJobProgress | null>(null)
  const [relatedSeed, setRelatedSeed] = useState<{
    entryId: MediaListEntryId
    mediaId: MediaId
    title: string
  } | null>(null)
  const loadedPreferences = useRef(new Set<MediaType>())
  const activeHandle = useRef<BulkJobHandle | null>(null)
  const lastCommand = useRef<BulkJobCommand | null>(null)
  const collectionController = useRef<AbortController | null>(null)
  const manualRefreshController = useRef<AbortController | null>(null)
  const relatedDiscoveryController = useRef<AbortController | null>(null)
  const bulkVerificationController = useRef<AbortController | null>(null)
  const relatedVerificationController = useRef<AbortController | null>(null)
  const relatedCancelled = useRef(false)
  const lastRelatedCommands = useRef<readonly BulkRunnerCommand[]>([])
  const shellRef = useRef<HTMLDivElement>(null)
  const persistentHeaderRef = useRef<HTMLElement>(null)
  const motionReadyRef = useRef(false)
  const mounted = useRef(true)

  const runner = useMemo(
    () => createBulkEditRunner(gateway),
    [gateway],
  )
  const key = useMemo(
    () => ({ accountId: account.id, mediaType }),
    [account.id, mediaType],
  )
  const snapshot = useWorkspaceCollection(workspace, key)
  const query = queries[mediaType]
  const scopedSelection = useMemo(
    () => reconcileSelectionScope(selection, key, query),
    [key, query, selection],
  )
  const derivedList = useMemo(
    () => projectListWithIds(snapshot.entries, query),
    [query, snapshot.entries],
  )
  const projection = derivedList.projection
  const hasPendingBulkOutcome =
    bulkOutcome !== null && bulkOutcome.status !== 'completed'
  const hasPendingBulkAmbiguity =
    bulkOutcome !== null && hasAmbiguousResults(bulkOutcome)

  const commitWorkspaceOutcome = useCallback(
    (
      targetKey: CollectionKey,
      patches: readonly ConfirmedEntryPatch[],
      deletedIds: readonly MediaListEntryId[],
      createdEntries: readonly CreatedMediaListEntry[] = [],
    ) => {
      workspace.commitJobOutcome(
        targetKey,
        patches,
        deletedIds,
        createdEntries,
      )
      const nextEntries = workspace.getCollection(targetKey).entries
      setQueries((current) => {
        const currentQuery = current[targetKey.mediaType]
        const clampedPage = projectListWithIds(
          nextEntries,
          currentQuery,
        ).projection.page
        if (currentQuery.page === clampedPage) return current
        return {
          ...current,
          [targetKey.mediaType]: { ...currentQuery, page: clampedPage },
        }
      })
    },
    [workspace],
  )

  const prepareMotion = useCallback(async () => {
    if (motionReadyRef.current) return true
    try {
      await preloadMediaListMotion()
    } catch {
      return false
    }
    if (!mounted.current) return false
    motionReadyRef.current = true
    setMotionReady(true)
    await new Promise<void>((resolve) => {
      let settled = false
      let timeout = 0
      const finish = () => {
        if (settled) return
        settled = true
        window.clearTimeout(timeout)
        resolve()
      }
      timeout = window.setTimeout(finish, 250)
      if (document.visibilityState === 'hidden') {
        finish()
        return
      }
      requestAnimationFrame(() => {
        if (!settled) requestAnimationFrame(finish)
      })
    })
    return true
  }, [])

  useEffect(() => {
    mounted.current = true
    const bulkVerification = bulkVerificationController
    const relatedVerification = relatedVerificationController
    return () => {
      mounted.current = false
      collectionController.current?.abort()
      manualRefreshController.current?.abort()
      relatedDiscoveryController.current?.abort()
      bulkVerification.current?.abort()
      relatedVerification.current?.abort()
      activeHandle.current?.cancel()
      setJobRunning(false)
    }
  }, [setJobRunning])

  useEffect(() => {
    const shell = shellRef.current
    const header = persistentHeaderRef.current
    if (!shell || !header) return

    const updateStickyOffset = () => {
      shell.style.setProperty(
        '--workspace-header-height',
        `${Math.ceil(header.getBoundingClientRect().height)}px`,
      )
    }
    updateStickyOffset()

    const observer = new ResizeObserver(updateStickyOffset)
    observer.observe(header)
    window.addEventListener('resize', updateStickyOffset)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateStickyOffset)
    }
  }, [])

  useEffect(() => {
    if (!preferences || loadedPreferences.current.has(mediaType)) return
    let cancelled = false
    void preferences.get(account.id, mediaType).then((stored) => {
      if (cancelled) return
      loadedPreferences.current.add(mediaType)
      setQueries((current) => ({
        ...current,
        [mediaType]: queryFromPreferences(stored),
      }))
      setViewModes((current) => ({
        ...current,
        [mediaType]: viewModeFromPreferences(stored),
      }))
    })
    return () => {
      cancelled = true
    }
  }, [account.id, mediaType, preferences])

  useEffect(() => {
    if (!preferences || !loadedPreferences.current.has(mediaType)) return
    const timer = window.setTimeout(() => {
      void preferences.set(
        account.id,
        mediaType,
        queryToPreferences(query, viewModes[mediaType]),
      )
    }, 250)
    return () => window.clearTimeout(timer)
  }, [account.id, mediaType, preferences, query, viewModes])

  const markInvalidAccount = useCallback(
    async (error: unknown) => {
      if (
        error instanceof AniListGatewayError &&
        error.confirmedInvalidToken
      ) {
        await markReauthenticationRequired(account.id)
      }
    },
    [account.id, markReauthenticationRequired],
  )

  const loadCollection = useCallback(
    async (signal?: AbortSignal): Promise<boolean> => {
      if (!gateway) return false
      const request = workspace.beginLoad(key)
      try {
        const entries = await gateway.loadMediaListCollection({
          accountId: account.id,
          mediaType,
          signal,
        })
        return workspace.resolveLoad(
          request,
          entries.map(toWorkspaceEntry),
          Date.now(),
        )
      } catch (error) {
        if (error instanceof AniListGatewayError && error.kind === 'cancelled') {
          workspace.cancelLoad(request)
          return false
        }
        await markInvalidAccount(error)
        const offline = typeof navigator !== 'undefined' && !navigator.onLine
        workspace.rejectLoad(
          request,
          offline
            ? { kind: 'offline' }
            : {
                kind: 'error',
                message:
                  error instanceof Error
                    ? error.message
                    : 'The AniList collection could not be loaded.',
                retryable:
                  error instanceof AniListGatewayError ? error.retryable : true,
              },
        )
        return false
      }
    },
    [account.id, gateway, key, markInvalidAccount, mediaType, workspace],
  )

  useEffect(() => {
    if (
      snapshot.loadState.status !== 'idle' ||
      collectionController.current !== null
    ) {
      return
    }
    const controller = new AbortController()
    collectionController.current = controller
    void loadCollection(controller.signal).finally(() => {
      if (collectionController.current === controller) {
        collectionController.current = null
      }
    })
  }, [loadCollection, snapshot.loadState.status])

  useEffect(
    () => () => {
      collectionController.current?.abort()
      collectionController.current = null
      manualRefreshController.current?.abort()
      manualRefreshController.current = null
    },
    [account.id, mediaType],
  )

  const refreshCatalog = useCallback(async (signal?: AbortSignal): Promise<boolean> => {
    if (!gateway) return false
    if (
      catalogRequestId.current > 0 &&
      catalogStateRef.current.status === 'loading'
    ) {
      return false
    }
    const requestId = ++catalogRequestId.current
    const previousState = catalogStateRef.current
    const loadingState: CatalogState = {
      status: 'loading',
      catalog: previousState.catalog,
      ...(previousState.loadedAt === undefined
        ? {}
        : { loadedAt: previousState.loadedAt }),
    }
    catalogStateRef.current = loadingState
    setCatalogState(loadingState)
    try {
      const catalog = await gateway.getMediaListOptionsCatalog({
        accountId: account.id,
        signal,
      })
      if (signal?.aborted) {
        if (requestId === catalogRequestId.current && mounted.current) {
          catalogStateRef.current = previousState
          setCatalogState(previousState)
        }
        return false
      }
      if (requestId !== catalogRequestId.current) return false
      if (requestId === catalogRequestId.current && mounted.current) {
        const readyState: CatalogState = {
          status: 'ready',
          catalog,
          loadedAt: Date.now(),
        }
        catalogStateRef.current = readyState
        setCatalogState(readyState)
      }
      return true
    } catch (error) {
      if (
        signal?.aborted ||
        (error instanceof AniListGatewayError && error.kind === 'cancelled')
      ) {
        if (requestId === catalogRequestId.current && mounted.current) {
          catalogStateRef.current = previousState
          setCatalogState(previousState)
        }
        return false
      }
      if (requestId !== catalogRequestId.current) return false
      await markInvalidAccount(error)
      if (requestId === catalogRequestId.current && mounted.current) {
        const errorState: CatalogState = {
          status: 'error',
          catalog: loadingState.catalog,
          ...(loadingState.loadedAt === undefined
            ? {}
            : { loadedAt: loadingState.loadedAt }),
        }
        catalogStateRef.current = errorState
        setCatalogState(errorState)
      }
      return false
    }
  }, [account.id, gateway, markInvalidAccount])

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshCatalog(), 0)
    return () => window.clearTimeout(timer)
  }, [refreshCatalog])

  useEffect(() => {
    const refreshStaleCatalog = () => {
      const loadedAt = catalogState.loadedAt ?? 0
      if (Date.now() - loadedAt >= FIVE_MINUTES) void refreshCatalog()
    }
    window.addEventListener('focus', refreshStaleCatalog)
    return () => window.removeEventListener('focus', refreshStaleCatalog)
  }, [catalogState.loadedAt, refreshCatalog])

  const updateQuery = useCallback(
    (nextQuery: ListQuery) => {
      const keepsSelectionScope =
        createListQueryFingerprint(query) ===
        createListQueryFingerprint(nextQuery)
      if (hasPendingBulkOutcome && !keepsSelectionScope) {
        setBulkDialogOpen(true)
        return
      }
      void prepareMotion().then(() => {
        if (!mounted.current) return
        setSelection((current) =>
          reconcileSelectionScope(current, key, nextQuery),
        )
        setQueries((current) => ({ ...current, [mediaType]: nextQuery }))
      })
    },
    [hasPendingBulkOutcome, key, mediaType, prepareMotion, query],
  )

  const changeMediaType = async (nextType: MediaType) => {
    if (jobRunning) {
      enqueue({
        tone: 'info',
        message: 'Cancel or finish the current bulk job before switching lists.',
      })
      return
    }
    if (hasPendingBulkOutcome) {
      setBulkDialogOpen(true)
      return
    }
    if (nextType === mediaType) return
    await prepareMotion()
    if (!mounted.current) return
    setSelection(
      createScopedSelection(
        { accountId: account.id, mediaType: nextType },
        queries[nextType],
      ),
    )
    setMediaType(nextType)
  }

  const loadRelatedSeasons = useCallback(
    async (entryId: MediaListEntryId) => {
      const entry = snapshot.entries.find((candidate) => candidate.id === entryId)
      if (!gateway || !entry?.media) return
      if (jobRunning) {
        enqueue({
          tone: 'info',
          message: 'Finish or cancel the current job before finding related seasons.',
        })
        return
      }

      relatedDiscoveryController.current?.abort()
      const controller = new AbortController()
      relatedDiscoveryController.current = controller
      setRelatedSeed({
        entryId,
        mediaId: entry.mediaId,
        title: titleFor(entry),
      })
      setRelatedOpen(true)
      setRelatedLoading(true)
      setRelatedError(null)
      setRelatedActionError(null)
      setRelatedDiscovery(null)
      setRelatedOutcome(null)
      setRelatedSelected(new Set())

      try {
        const discovery = await gateway.discoverRelatedSeasons({
          accountId: account.id,
          seedId: entry.mediaId,
          mediaType,
          signal: controller.signal,
        })
        if (controller.signal.aborted || !mounted.current) return
        setRelatedDiscovery(discovery)
        setRelatedSelected(
          new Set(
            discovery.nodes
              .filter((node) => node.selectedByDefault)
              .map((node) => node.id),
          ),
        )
      } catch (error) {
        if (
          controller.signal.aborted ||
          (error instanceof AniListGatewayError && error.kind === 'cancelled')
        ) {
          return
        }
        await markInvalidAccount(error)
        if (mounted.current) {
          setRelatedError(
            error instanceof Error
              ? error.message
              : 'Related seasons could not be discovered.',
          )
        }
      } finally {
        if (relatedDiscoveryController.current === controller) {
          relatedDiscoveryController.current = null
        }
        if (mounted.current && !controller.signal.aborted) setRelatedLoading(false)
      }
    },
    [
      account.id,
      enqueue,
      gateway,
      jobRunning,
      markInvalidAccount,
      mediaType,
      snapshot.entries,
    ],
  )

  const catalog = catalogState.catalog ?? EMPTY_CATALOG
  const customLists =
    mediaType === 'ANIME' ? catalog.animeCustomLists : catalog.mangaCustomLists
  const filterOptions = useMemo<FilterOptions>(() => {
    const formats = new Set<MediaFormat>()
    const genres = new Set<string>()
    const countries = new Set<string>()
    for (const entry of snapshot.entries) {
      if (entry.media?.format) formats.add(entry.media.format)
      entry.media?.genres?.forEach((genre) => genres.add(genre))
      if (entry.media?.countryOfOrigin) countries.add(entry.media.countryOfOrigin)
    }
    return {
      customLists,
      formats: [...formats].sort(),
      genres: [...genres].sort(),
      countries: [...countries].sort(),
      customListsDisabled: catalogState.status === 'error',
      ...(catalogState.status === 'error'
        ? { customListsMessage: 'Custom lists could not be refreshed.' }
        : {}),
      ...(catalogState.loadedAt === undefined
        ? {}
        : { customListsLastSyncedAt: catalogState.loadedAt }),
    }
  }, [catalogState.loadedAt, catalogState.status, customLists, snapshot.entries])

  const selectOnly = (
    entryId: MediaListEntryId,
    mode: 'edit' | 'delete',
  ) => {
    if (hasPendingBulkAmbiguity) {
      setBulkDialogOpen(true)
      return
    }
    setSelection(createScopedSelection(key, query, [entryId]))
    setBulkMode(true)
    setBulkOutcome(null)
    setBulkActionError(null)
    setBulkDialogMode(mode)
    setBulkDialogOpen(true)
  }

  const finishOutcome = useCallback(
    async (
      outcome: BulkJobOutcome,
      command: BulkJobCommand,
      startedAt: number,
      retryBaseline: number,
    ) => {
      await prepareMotion()
      commitWorkspaceOutcome(
        { accountId: command.accountId, mediaType: command.mediaType },
        workspacePatches(outcome),
        outcome.confirmedDeletedIds,
      )

      if (
        outcome.failures.some(
          (failure) =>
            failure.kind === 'authentication' ||
            failure.authenticationConfirmed === true,
        )
      ) {
        await markReauthenticationRequired(command.accountId)
      }

      void trackBulkJobOutcome({
        outcome: outcome.status,
        durationMs: Date.now() - startedAt,
        selectedCount: command.entryIds.length,
        retryCount: retryCountSince(outcome.stats.retriedRequests, retryBaseline),
        errorCategory: outcome.failures[0]?.kind ?? 'none',
      })

      if (!mounted.current) return
      setBulkActionError(null)
      setBulkOutcome(outcome)
      const confirmed =
        outcome.confirmedPatches.length + outcome.confirmedDeletedIds.length

      if (outcome.status === 'completed') {
        setSelection(createScopedSelection(key, query))
        setBulkMode(false)
        setBulkDialogOpen(false)
        enqueue({
          tone: 'success',
          message: `${confirmed} ${confirmed === 1 ? 'entry was' : 'entries were'} confirmed without reloading the collection.`,
        })
        return
      }

      const remaining = [...new Set([
        ...outcome.failures.map((failure) => failure.entryId),
        ...outcome.unattemptedIds,
      ])]
      setSelection(createScopedSelection(key, query, remaining))
    },
    [
      enqueue,
      commitWorkspaceOutcome,
      key,
      markReauthenticationRequired,
      prepareMotion,
      query,
    ],
  )

  const runCommand = useCallback(
    (
      command: BulkJobCommand,
      retainedFailures: BulkJobOutcome['failures'] = [],
    ) => {
      if (!runner || command.entryIds.length === 0) return
      const startedAt = Date.now()
      const retryBaseline = gateway.getRateLimitStats().retriedRequests
      setBulkActionError(null)
      lastCommand.current = command
      setBulkProgress(null)
      setJobRunning(true)
      const handle = runner.start(command)
      activeHandle.current = handle
      const unsubscribe = handle.subscribe((progress) => {
        if (mounted.current) setBulkProgress(progress)
      })
      let terminalOutcome: BulkJobOutcome | null = null
      void handle.result
        .then((outcome) => {
          const terminal =
            retainedFailures.length === 0
              ? outcome
              : combineBulkJobOutcomes(
                  [
                    outcome,
                    {
                      status: 'failed',
                      confirmedPatches: [],
                      confirmedDeletedIds: [],
                      failures: retainedFailures,
                      unattemptedIds: [],
                      stats: outcome.stats,
                    },
                  ],
                  outcome.stats,
                )
          terminalOutcome = terminal
          return finishOutcome(terminal, command, startedAt, retryBaseline)
        })
        .catch((error) => {
          if (!mounted.current) return
          if (terminalOutcome) setBulkOutcome(terminalOutcome)
          setBulkActionError(
            error instanceof Error
              ? error.message
              : 'The confirmed result could not be finalized.',
          )
          setBulkDialogOpen(true)
        })
        .finally(() => {
          unsubscribe()
          if (activeHandle.current === handle) activeHandle.current = null
          if (mounted.current) {
            setJobRunning(false)
            setBulkProgress(null)
          }
        })
    },
    [finishOutcome, gateway, runner, setJobRunning],
  )

  const submitChanges = (changes: BulkChanges) => {
    if (hasPendingBulkOutcome) {
      setBulkDialogOpen(true)
      return
    }
    runCommand({
      accountId: account.id,
      mediaType,
      entryIds: [...scopedSelection.entryIds],
      changes,
    })
  }

  const deleteSelected = () => {
    if (hasPendingBulkOutcome) {
      setBulkDialogOpen(true)
      return
    }
    runCommand({
      operation: 'delete',
      accountId: account.id,
      mediaType,
      entryIds: [...scopedSelection.entryIds],
    })
  }

  const verifyUnknown = useCallback(async () => {
    const command = lastCommand.current
    if (
      !gateway ||
      !command ||
      !bulkOutcome ||
      !hasAmbiguousResults(bulkOutcome)
    ) {
      return
    }
    setJobRunning(true)
    const startedAt = Date.now()
    const retryBaseline = gateway.getRateLimitStats().retriedRequests
    setBulkActionError(null)
    const controller = new AbortController()
    bulkVerificationController.current = controller
    try {
      const verified = await verifyAmbiguousResults(
        gateway,
        [command],
        bulkOutcome,
        controller.signal,
      )
      await finishOutcome(verified, command, startedAt, retryBaseline)
    } catch (error) {
      if (
        !controller.signal.aborted &&
        !(error instanceof AniListGatewayError && error.kind === 'cancelled')
      ) {
        setBulkActionError(
          error instanceof Error ? error.message : 'Verification failed.',
        )
      }
    } finally {
      if (bulkVerificationController.current === controller) {
        bulkVerificationController.current = null
      }
      setJobRunning(false)
    }
  }, [bulkOutcome, finishOutcome, gateway, setJobRunning])

  const retryRemaining = () => {
    if (!bulkOutcome) return
    if (hasAmbiguousResults(bulkOutcome)) {
      void verifyUnknown()
      return
    }
    const previous = lastCommand.current
    if (!previous) return
    const entryIds = [...retryableEntryIds(bulkOutcome)]
    if (entryIds.length === 0) return
    const retried = new Set(entryIds)
    const retainedFailures = bulkOutcome.failures.filter(
      (failure) => !retried.has(failure.entryId),
    )
    runCommand(
      previous.operation === 'delete'
        ? { ...previous, entryIds }
        : { ...previous, entryIds },
      retainedFailures,
    )
  }

  const finishRelatedOutcome = useCallback(
    async (
      aggregate: BulkJobOutcome,
      targetNodes: readonly RelatedSeasonPreviewNode[],
      startedAt: number,
      selectedCount: number,
      retryBaseline: number,
    ) => {
      await prepareMotion()
      const nodeById = new Map(targetNodes.map((node) => [node.id, node]))
      const createdEntries = (aggregate.confirmedCreatedEntries ?? []).flatMap(
        (created): CreatedMediaListEntry[] => {
          const node = nodeById.get(created.mediaId)
          return node
            ? [createdWorkspaceEntry(created, node, account.id)]
            : []
        },
      )
      commitWorkspaceOutcome(
        key,
        workspacePatches(aggregate),
        aggregate.confirmedDeletedIds,
        createdEntries,
      )

      const invalidToken = [
        ...aggregate.failures,
        ...(aggregate.creationFailures ?? []),
      ].some(
        (failure) =>
          failure.kind === 'authentication' ||
          failure.authenticationConfirmed === true,
      )
      if (invalidToken) {
        await markReauthenticationRequired(account.id)
      }

      const successfulMediaIds = new Set<number>([
        ...(aggregate.confirmedCreatedEntries?.map((entry) => entry.mediaId) ?? []),
        ...targetNodes
          .filter(
            (node) =>
              node.existingListEntry &&
              aggregate.confirmedPatches.some(
                (patch) => patch.entryId === node.existingListEntry?.entryId,
              ),
          )
          .map((node) => node.id),
      ])
      const remainingMediaIds = targetNodes
        .filter((node) => !successfulMediaIds.has(node.id))
        .map((node) => node.id)

      void trackBulkJobOutcome({
        outcome: aggregate.status,
        durationMs: Date.now() - startedAt,
        selectedCount,
        retryCount: retryCountSince(
          aggregate.stats.retriedRequests,
          retryBaseline,
        ),
        errorCategory:
          aggregate.failures[0]?.kind ??
          aggregate.creationFailures?.[0]?.kind ??
          'none',
      })

      if (!mounted.current) return
      setRelatedActionError(null)
      setRelatedOutcome(aggregate)
      setRelatedSelected(new Set(remainingMediaIds))
      if (aggregate.status === 'completed') {
        setRelatedOpen(false)
        enqueue({
          tone: 'success',
          message: `${selectedCount} related ${
            selectedCount === 1 ? 'season was' : 'seasons were'
          } confirmed without reloading the collection.`,
        })
      }
    },
    [
      account.id,
      commitWorkspaceOutcome,
      enqueue,
      key,
      markReauthenticationRequired,
      prepareMotion,
    ],
  )

  const confirmRelatedSeasons = useCallback(
    async (
      mediaIds: readonly MediaId[],
      retainedOutcome?: BulkJobOutcome,
      scopeMediaIds: readonly MediaId[] = mediaIds,
    ) => {
      if (!runner || !gateway || !relatedDiscovery || mediaIds.length === 0) return
      const selected = relatedDiscovery.nodes.filter((node) =>
        mediaIds.includes(node.id),
      )
      const commands: BulkRunnerCommand[] = []
      const missing = selected.filter((node) => node.existingListEntry === null)
      if (missing.length > 0) {
        commands.push({
          operation: 'create',
          accountId: account.id,
          mediaType,
          entries: missing.map((node) => ({
            mediaId: node.id,
            status: node.proposedAction.status,
            ...(node.proposedAction.progress === undefined
              ? {}
              : { progress: node.proposedAction.progress }),
          })),
        })
      }

      const existingGroups = new Map<
        string,
        Array<
          RelatedSeasonPreviewNode & {
            existingListEntry: NonNullable<
              RelatedSeasonPreviewNode['existingListEntry']
            >
          }
        >
      >()
      selected
        .filter(
          (node): node is RelatedSeasonPreviewNode & {
            existingListEntry: NonNullable<RelatedSeasonPreviewNode['existingListEntry']>
          } => node.existingListEntry !== null,
        )
        .forEach((node) => {
          const groupKey =
            node.proposedAction.progress === undefined
              ? 'unspecified'
              : String(node.proposedAction.progress)
          const group = existingGroups.get(groupKey) ?? []
          group.push(node)
          existingGroups.set(groupKey, group)
        })

      for (const group of existingGroups.values()) {
        const progress = group[0]?.proposedAction.progress
        commands.push({
          accountId: account.id,
          mediaType,
          entryIds: group.map((node) => node.existingListEntry.entryId),
          changes: {
            status: setTo('COMPLETED'),
            score: unchanged<number>(),
            progress:
              progress === undefined ? unchanged<number>() : setTo(progress),
            private: unchanged<boolean>(),
            hiddenFromStatusLists: unchanged<boolean>(),
            notes: unchanged<string>(),
            customLists: {},
          },
        })
      }
      lastRelatedCommands.current = commands

      setRelatedOutcome(null)
      setRelatedActionError(null)
      setRelatedProgress(null)
      relatedCancelled.current = false
      setJobRunning(true)
      const startedAt = Date.now()
      const retryBaseline = gateway.getRateLimitStats().retriedRequests
      const outcomes: BulkJobOutcome[] = []
      let terminalAggregate: BulkJobOutcome | null = null
      let completedBefore = 0
      let confirmedBefore = 0
      let failedBefore = 0

      try {
        for (const command of commands) {
          if (relatedCancelled.current) break
          const handle = runner.start(command)
          activeHandle.current = handle
          const unsubscribe = handle.subscribe((progress) => {
            if (!mounted.current) return
            setRelatedProgress({
              ...progress,
              total: selected.length,
              attempted: Math.min(
                selected.length,
                completedBefore + progress.attempted,
              ),
              confirmed: confirmedBefore + progress.confirmed,
              failed: failedBefore + progress.failed,
              unattempted: Math.max(
                0,
                selected.length - completedBefore - progress.attempted,
              ),
            })
          })
          const outcome = await handle.result
          unsubscribe()
          outcomes.push(outcome)
          const commandTotal =
            command.operation === 'create'
              ? command.entries.length
              : command.entryIds.length
          completedBefore += commandTotal
          confirmedBefore +=
            outcome.confirmedPatches.length +
            outcome.confirmedDeletedIds.length +
            (outcome.confirmedCreatedEntries?.length ?? 0)
          failedBefore +=
            outcome.failures.length + (outcome.creationFailures?.length ?? 0)
          if (outcome.status === 'cancelled') break
        }

        let aggregate = combineBulkJobOutcomes(
          retainedOutcome ? [...outcomes, retainedOutcome] : outcomes,
          gateway.getRateLimitStats(),
        )
        const confirmedMediaIds = new Set(
          aggregate.confirmedCreatedEntries?.map((entry) => entry.mediaId) ?? [],
        )
        const confirmedEntryIds = new Set(
          aggregate.confirmedPatches.map((patch) => patch.entryId),
        )
        const failedMediaIds = new Set(
          aggregate.creationFailures?.map((failure) => failure.mediaId) ?? [],
        )
        const failedEntryIds = new Set(
          aggregate.failures.map((failure) => failure.entryId),
        )
        const extraUnattemptedMediaIds: number[] = []
        const extraUnattemptedIds: number[] = []

        for (const node of selected) {
          if (node.existingListEntry) {
            if (
              !confirmedEntryIds.has(node.existingListEntry.entryId) &&
              !failedEntryIds.has(node.existingListEntry.entryId)
            ) {
              extraUnattemptedIds.push(node.existingListEntry.entryId)
            }
          } else if (
            !confirmedMediaIds.has(node.id) &&
            !failedMediaIds.has(node.id)
          ) {
            extraUnattemptedMediaIds.push(node.id)
          }
        }

        if (
          extraUnattemptedIds.length > 0 ||
          extraUnattemptedMediaIds.length > 0 ||
          relatedCancelled.current
        ) {
          aggregate = {
            ...aggregate,
            status: relatedCancelled.current ? 'cancelled' : aggregate.status,
            unattemptedIds: [
              ...new Set([...aggregate.unattemptedIds, ...extraUnattemptedIds]),
            ],
            unattemptedMediaIds: [
              ...new Set([
                ...(aggregate.unattemptedMediaIds ?? []),
                ...extraUnattemptedMediaIds,
              ]),
            ],
          }
        }

        const scopeNodes = relatedDiscovery.nodes.filter((node) =>
          scopeMediaIds.includes(node.id),
        )
        terminalAggregate = aggregate
        await finishRelatedOutcome(
          aggregate,
          scopeNodes,
          startedAt,
          selected.length,
          retryBaseline,
        )
      } catch (error) {
        if (terminalAggregate) setRelatedOutcome(terminalAggregate)
        setRelatedActionError(
          error instanceof Error
            ? error.message
            : 'The related-season job failed unexpectedly.',
        )
      } finally {
        activeHandle.current = null
        if (mounted.current) {
          setJobRunning(false)
          setRelatedProgress(null)
        }
      }
    },
    [
      account.id,
      finishRelatedOutcome,
      gateway,
      mediaType,
      relatedDiscovery,
      runner,
      setJobRunning,
    ],
  )

  const verifyRelatedUnknown = useCallback(async () => {
    if (
      !gateway ||
      !relatedDiscovery ||
      !relatedOutcome ||
      !hasAmbiguousResults(relatedOutcome)
    ) {
      return
    }
    const controller = new AbortController()
    relatedVerificationController.current = controller
    setJobRunning(true)
    const startedAt = Date.now()
    const retryBaseline = gateway.getRateLimitStats().retriedRequests
    setRelatedActionError(null)
    try {
      const verified = await verifyAmbiguousResults(
        gateway,
        lastRelatedCommands.current,
        relatedOutcome,
        controller.signal,
      )
      const targetNodes = relatedDiscovery.nodes.filter((node) =>
        relatedSelected.has(node.id),
      )
      await finishRelatedOutcome(
        verified,
        targetNodes,
        startedAt,
        targetNodes.length,
        retryBaseline,
      )
    } catch (error) {
      if (
        !controller.signal.aborted &&
        !(error instanceof AniListGatewayError && error.kind === 'cancelled')
      ) {
        setRelatedActionError(
          error instanceof Error
            ? error.message
            : 'Related-season verification failed.',
        )
      }
    } finally {
      if (relatedVerificationController.current === controller) {
        relatedVerificationController.current = null
      }
      if (mounted.current) setJobRunning(false)
    }
  }, [
    finishRelatedOutcome,
    gateway,
    relatedDiscovery,
    relatedOutcome,
    relatedSelected,
    setJobRunning,
  ])

  const retryOrVerifyRelated = () => {
    if (!relatedSeed) return
    if (relatedError) {
      void loadRelatedSeasons(relatedSeed.entryId)
      return
    }
    if (!relatedOutcome) return
    if (hasAmbiguousResults(relatedOutcome)) {
      void verifyRelatedUnknown()
      return
    }

    const retryEntrySet = new Set(retryableEntryIds(relatedOutcome))
    const retryMediaSet = new Set(retryableMediaIds(relatedOutcome))
    const retryNodes = relatedDiscovery?.nodes.filter(
      (node) =>
        relatedSelected.has(node.id) &&
        (node.existingListEntry
          ? retryEntrySet.has(node.existingListEntry.entryId)
          : retryMediaSet.has(node.id)),
    ) ?? []
    if (retryNodes.length === 0) return

    const retriedEntryIds = new Set(
      retryNodes.flatMap((node) =>
        node.existingListEntry ? [node.existingListEntry.entryId] : [],
      ),
    )
    const retriedMediaIds = new Set(
      retryNodes
        .filter((node) => node.existingListEntry === null)
        .map((node) => node.id),
    )
    const retained: BulkJobOutcome = {
      status: 'failed',
      confirmedPatches: [],
      confirmedDeletedIds: [],
      confirmedCreatedEntries: [],
      failures: relatedOutcome.failures.filter(
        (failure) => !retriedEntryIds.has(failure.entryId),
      ),
      creationFailures: (relatedOutcome.creationFailures ?? []).filter(
        (failure) => !retriedMediaIds.has(failure.mediaId),
      ),
      unattemptedIds: relatedOutcome.unattemptedIds.filter(
        (entryId) => !retriedEntryIds.has(entryId),
      ),
      unattemptedMediaIds: (relatedOutcome.unattemptedMediaIds ?? []).filter(
        (mediaId) => !retriedMediaIds.has(mediaId),
      ),
      stats: relatedOutcome.stats,
    }
    void confirmRelatedSeasons(
      retryNodes.map((node) => node.id),
      retained,
      [...relatedSelected],
    )
  }

  const refreshEverything = async () => {
    if (manualRefreshing) return
    const controller = new AbortController()
    manualRefreshController.current = controller
    setManualRefreshing(true)
    try {
      const [collectionOk, catalogOk] = await Promise.all([
        loadCollection(controller.signal),
        refreshCatalog(controller.signal),
      ])
      if (controller.signal.aborted || !mounted.current) return
      enqueue({
        tone: collectionOk && catalogOk ? 'success' : 'warning',
        message:
          collectionOk && catalogOk
            ? 'The active list and custom-list catalog are up to date.'
            : 'Refresh finished with a problem; the current cards were kept in place.',
      })
    } finally {
      if (manualRefreshController.current === controller) {
        manualRefreshController.current = null
      }
      if (mounted.current) setManualRefreshing(false)
    }
  }

  const allFilteredIds = derivedList.filteredEntryIds

  return (
    <div
      ref={shellRef}
      className="workspace-shell min-h-screen bg-slate-50 dark:bg-slate-950"
    >
      <header
        ref={persistentHeaderRef}
        className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95"
      >
        <div className="mx-auto flex min-h-16 max-w-[100rem] flex-wrap items-center gap-3 px-3 py-2 sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-black tracking-tight">AniList Bulk Edit</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              <span className="sm:hidden">Unofficial tool</span>
              <span className="hidden sm:inline">Unofficial third-party tool</span>
            </p>
          </div>
          <AccountControls
            refreshing={
              manualRefreshing ||
              catalogState.status === 'loading' ||
              snapshot.loadState.status === 'refreshing'
            }
            onRefresh={() => void refreshEverything()}
            onMessage={(message, tone) => enqueue({ tone: tone ?? 'info', message })}
          />
        </div>
      </header>

      <main className="mx-auto max-w-[100rem] px-3 py-4 sm:px-6 sm:py-6">
        <MediaWorkspaceView
          mediaType={mediaType}
          onMediaTypeChange={changeMediaType}
          query={query}
          onQueryChange={updateQuery}
          filterOptions={filterOptions}
          projection={projection}
          viewMode={viewModes[mediaType]}
          onViewModeChange={(viewMode) => {
            void prepareMotion().then(() => {
              if (!mounted.current) return
              setViewModes((current) => ({
                ...current,
                [mediaType]: viewMode,
              }))
            })
          }}
          loadState={snapshot.loadState}
          motionReady={motionReady}
          bulkMode={bulkMode}
          selectedIds={scopedSelection.entryIds}
          onStartBulkMode={() => {
            if (hasPendingBulkOutcome) {
              setBulkDialogOpen(true)
              return
            }
            void prepareMotion().then(() => {
              if (!mounted.current) return
              setBulkMode(true)
              setSelection(createScopedSelection(key, query))
            })
          }}
          onToggleSelection={(entryId) => {
            if (hasPendingBulkOutcome) {
              setBulkDialogOpen(true)
              return
            }
            setSelection(toggleSelectedEntry(scopedSelection, entryId))
          }}
          onSelectPage={(entryIds) => {
            if (hasPendingBulkOutcome) {
              setBulkDialogOpen(true)
              return
            }
            setSelection(selectEntryIds(scopedSelection, entryIds))
          }}
          onSelectAllFiltered={() => {
            if (hasPendingBulkOutcome) {
              setBulkDialogOpen(true)
              return
            }
            setSelection(selectEntryIds(scopedSelection, allFilteredIds))
          }}
          onEditSelected={() => {
            if (hasPendingBulkOutcome) {
              setBulkDialogOpen(true)
              return
            }
            setBulkOutcome(null)
            setBulkActionError(null)
            setBulkDialogMode('edit')
            setBulkDialogOpen(true)
          }}
          onDeleteSelected={() => {
            if (hasPendingBulkOutcome) {
              setBulkDialogOpen(true)
              return
            }
            setBulkOutcome(null)
            setBulkActionError(null)
            setBulkDialogMode('delete')
            setBulkDialogOpen(true)
          }}
          onExitBulkMode={() => {
            if (jobRunning) return
            if (hasPendingBulkAmbiguity) {
              setBulkDialogOpen(true)
              return
            }
            setBulkOutcome(null)
            setBulkActionError(null)
            setBulkMode(false)
            setSelection(createScopedSelection(key, query))
          }}
          onEdit={(entryId) => selectOnly(entryId, 'edit')}
          onDelete={(entryId) => selectOnly(entryId, 'delete')}
          onFindRelated={(entryId) => void loadRelatedSeasons(entryId)}
          onRetry={() => void loadCollection()}
          onRefreshCustomLists={() => void refreshCatalog()}
          customListsRefreshing={catalogState.status === 'loading'}
        />
      </main>

      {bulkDialogOpen || bulkOutcome !== null ? (
        <BulkEditDialog
          open={bulkDialogOpen}
          initialMode={bulkDialogMode}
          accountName={account.name}
          selectedCount={scopedSelection.entryIds.size}
          customListCatalog={{
            status: catalogState.status,
            names: customLists,
            ...(catalogState.loadedAt === undefined
              ? {}
              : { lastSyncedAt: catalogState.loadedAt }),
          }}
          running={jobRunning}
          progress={bulkProgress}
          outcome={bulkOutcome}
          actionError={bulkActionError}
          onSubmit={submitChanges}
          onDelete={deleteSelected}
          onCancel={() => {
            bulkVerificationController.current?.abort()
            activeHandle.current?.cancel()
          }}
          onClose={() => {
            if (!jobRunning && !hasPendingBulkAmbiguity) {
              setBulkDialogOpen(false)
            }
          }}
          onRetryRemaining={retryRemaining}
          onRefreshCatalog={() => void refreshCatalog()}
        />
      ) : null}

      {relatedOpen ? (
        <RelatedSeasonsDialog
          open={relatedOpen}
          accountName={account.name}
          seedTitle={relatedSeed?.title ?? 'selected media'}
          loading={relatedLoading}
          error={relatedError}
          discovery={relatedDiscovery}
          selectedMediaIds={relatedSelected}
          running={jobRunning && relatedOpen}
          progress={relatedProgress}
          outcome={relatedOutcome}
          actionError={relatedActionError}
          onToggle={(mediaId) => {
            if (relatedOutcome) return
            setRelatedSelected((current) => {
              const next = new Set(current)
              if (next.has(mediaId)) next.delete(mediaId)
              else next.add(mediaId)
              return next
            })
          }}
          onConfirm={(mediaIds) => {
            if (relatedOutcome) return
            void confirmRelatedSeasons(mediaIds)
          }}
          onCancel={() => {
            relatedCancelled.current = true
            relatedVerificationController.current?.abort()
            activeHandle.current?.cancel()
          }}
          onClose={() => {
            if (jobRunning) return
            if (relatedOutcome && hasAmbiguousResults(relatedOutcome)) return
            relatedDiscoveryController.current?.abort()
            setRelatedOpen(false)
            setRelatedOutcome(null)
            setRelatedActionError(null)
          }}
          onRetry={retryOrVerifyRelated}
        />
      ) : null}
    </div>
  )
}
