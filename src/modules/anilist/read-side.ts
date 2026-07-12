import {
  AniListGatewayError,
  AniListTransportError,
  SchedulerCancelledError,
} from './errors'
import type {
  CollectionMedia,
  CollectionMediaCover,
  CollectionMediaTitle,
  DiscoverRelatedSeasonsRequest,
  FuzzyDate,
  GraphQLError,
  GraphQLResult,
  GraphQLTransport,
  LoadMediaListCollectionRequest,
  MediaListCollectionEntry,
  MediaListOptionsCatalog,
  MediaListOptionsCatalogRequest,
  MediaListStatus,
  MediaType,
  ReadMediaRelationsRequest,
  RelatedMediaConnection,
  RelatedMediaListEntry,
  RelatedMediaRecord,
  RelatedSeasonDiscovery,
  RelatedSeasonPreviewNode,
} from './types'

const COLLECTION_QUERY = `
  query MediaListWorkspace($userId: Int!, $type: MediaType!) {
    MediaListCollection(userId: $userId, type: $type) {
      lists {
        entries {
          id
          mediaId
          status
          score
          progress
          private
          hiddenFromStatusLists
          notes
          customLists
          startedAt { year month day }
          updatedAt
          media {
            id
            title { userPreferred romaji english native }
            type
            format
            startDate { year month day }
            seasonYear
            episodes
            chapters
            countryOfOrigin
            genres
            coverImage { large medium color }
          }
        }
      }
    }
  }
`

const OPTIONS_QUERY = `
  query MediaListOptionsCatalog {
    Viewer {
      mediaListOptions {
        animeList { customLists }
        mangaList { customLists }
      }
    }
  }
`

const RELATIONS_QUERY = `
  query RelatedMedia($ids: [Int], $perPage: Int!) {
    Page(page: 1, perPage: $perPage) {
      media(id_in: $ids) {
        id
        title { userPreferred romaji english native }
        type
        format
        startDate { year month day }
        seasonYear
        episodes
        chapters
        countryOfOrigin
        genres
        coverImage { large medium color }
        mediaListEntry { id status progress }
        relations {
          edges {
            relationType
            node { id type }
          }
        }
      }
    }
  }
`

type UnknownRecord = Record<string, unknown>

const record = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null

const positiveInteger = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null

const finiteNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

const optionalString = (value: unknown): string | null | undefined =>
  value === null || typeof value === 'string' ? value : undefined

const mediaType = (value: unknown): MediaType | null =>
  value === 'ANIME' || value === 'MANGA' ? value : null

const date = (value: unknown): FuzzyDate | null | undefined => {
  if (value === null) return null
  const source = record(value)
  if (!source) return undefined
  return {
    ...(source.year === null || typeof source.year === 'number' ? { year: source.year } : {}),
    ...(source.month === null || typeof source.month === 'number'
      ? { month: source.month }
      : {}),
    ...(source.day === null || typeof source.day === 'number' ? { day: source.day } : {}),
  }
}

const title = (value: unknown): CollectionMediaTitle => {
  const source = record(value) ?? {}
  return {
    ...(optionalString(source.userPreferred) !== undefined
      ? { userPreferred: optionalString(source.userPreferred) }
      : {}),
    ...(optionalString(source.romaji) !== undefined
      ? { romaji: optionalString(source.romaji) }
      : {}),
    ...(optionalString(source.english) !== undefined
      ? { english: optionalString(source.english) }
      : {}),
    ...(optionalString(source.native) !== undefined
      ? { native: optionalString(source.native) }
      : {}),
  }
}

const cover = (value: unknown): CollectionMediaCover | null | undefined => {
  if (value === null) return null
  const source = record(value)
  if (!source) return undefined
  return {
    ...(optionalString(source.large) !== undefined
      ? { large: optionalString(source.large) }
      : {}),
    ...(optionalString(source.medium) !== undefined
      ? { medium: optionalString(source.medium) }
      : {}),
    ...(optionalString(source.color) !== undefined
      ? { color: optionalString(source.color) }
      : {}),
  }
}

const customLists = (value: unknown): Readonly<Record<string, boolean>> | undefined => {
  const source = record(value)
  if (!source) return undefined
  return Object.fromEntries(
    Object.entries(source).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === 'boolean',
    ),
  )
}

const stringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string'))]
    : []

const normalizeCollectionMedia = (
  value: unknown,
  fallbackType: MediaType,
): CollectionMedia | null => {
  const source = record(value)
  const id = positiveInteger(source?.id)
  if (!source || id === null) return null
  const startDate = date(source.startDate)
  const coverImage = cover(source.coverImage)
  return {
    id,
    title: title(source.title),
    type: mediaType(source.type) ?? fallbackType,
    ...(optionalString(source.format) !== undefined
      ? { format: optionalString(source.format) }
      : {}),
    ...(startDate !== undefined ? { startDate } : {}),
    ...(finiteNumber(source.seasonYear) !== undefined
      ? { seasonYear: finiteNumber(source.seasonYear) }
      : {}),
    ...(finiteNumber(source.episodes) !== undefined
      ? { episodes: finiteNumber(source.episodes) }
      : source.episodes === null
        ? { episodes: null }
        : {}),
    ...(finiteNumber(source.chapters) !== undefined
      ? { chapters: finiteNumber(source.chapters) }
      : source.chapters === null
        ? { chapters: null }
        : {}),
    ...(optionalString(source.countryOfOrigin) !== undefined
      ? { countryOfOrigin: optionalString(source.countryOfOrigin) }
      : {}),
    genres: stringList(source.genres),
    ...(coverImage !== undefined ? { coverImage } : {}),
  }
}

const normalizeCollectionEntry = (
  value: unknown,
  accountId: number,
  fallbackType: MediaType,
): MediaListCollectionEntry | null => {
  const source = record(value)
  const id = positiveInteger(source?.id)
  const mediaId = positiveInteger(source?.mediaId)
  const media = normalizeCollectionMedia(source?.media, fallbackType)
  if (!source || id === null || mediaId === null || !media) return null
  const startedAt = date(source.startedAt)
  const memberships = customLists(source.customLists)
  return {
    id,
    userId: accountId,
    mediaId,
    ...(typeof source.status === 'string'
      ? { status: source.status as MediaListStatus }
      : {}),
    ...(finiteNumber(source.score) !== undefined ? { score: finiteNumber(source.score) } : {}),
    ...(finiteNumber(source.progress) !== undefined
      ? { progress: finiteNumber(source.progress) }
      : {}),
    ...(typeof source.private === 'boolean' ? { private: source.private } : {}),
    ...(typeof source.hiddenFromStatusLists === 'boolean'
      ? { hiddenFromStatusLists: source.hiddenFromStatusLists }
      : {}),
    ...(typeof source.notes === 'string' ? { notes: source.notes } : {}),
    ...(memberships !== undefined ? { customLists: memberships } : {}),
    ...(startedAt !== undefined ? { startedAt } : {}),
    ...(finiteNumber(source.updatedAt) !== undefined
      ? { updatedAt: finiteNumber(source.updatedAt) }
      : {}),
    media,
  }
}

const graphQLErrorStatus = (error: GraphQLError): number | undefined => {
  const raw = error.extensions?.status ?? error.extensions?.statusCode
  const parsed = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

const classifiedError = (
  message: string,
  status: number | undefined,
  cause?: unknown,
): AniListGatewayError => {
  const lower = message.toLowerCase()
  const confirmedInvalidToken =
    status === 401 || lower.includes('invalid token') || lower.includes('unauthenticated')
  if (confirmedInvalidToken) {
    return new AniListGatewayError('Reconnect this AniList account to continue.', {
      kind: 'authentication',
      retryable: false,
      status,
      confirmedInvalidToken: true,
      cause,
    })
  }
  if (status === 429 || lower.includes('rate limit') || lower.includes('too many')) {
    return new AniListGatewayError('AniList is rate limiting requests.', {
      kind: 'rate-limit',
      retryable: true,
      status,
      cause,
    })
  }
  if (status === 400 || status === 422 || lower.includes('validation')) {
    return new AniListGatewayError(message, {
      kind: 'validation',
      retryable: false,
      status,
      cause,
    })
  }
  if (
    status === 403 ||
    (status !== undefined && status >= 500) ||
    lower.includes('network') ||
    lower.includes('upstream') ||
    cause instanceof AniListTransportError
  ) {
    return new AniListGatewayError(message, {
      kind: 'network',
      retryable: true,
      status,
      cause,
    })
  }
  return new AniListGatewayError(message, {
    kind: 'unknown',
    retryable: false,
    status,
    cause,
  })
}

const normalizeReadError = (error: unknown): AniListGatewayError => {
  if (error instanceof AniListGatewayError) return error
  if (error instanceof SchedulerCancelledError) {
    return new AniListGatewayError(error.message, {
      kind: 'cancelled',
      retryable: true,
      cause: error,
    })
  }
  if (error instanceof AniListTransportError) {
    return classifiedError(error.message, error.status, error)
  }
  return new AniListGatewayError(
    error instanceof Error ? error.message : 'AniList read failed.',
    { kind: 'unknown', retryable: false, cause: error },
  )
}

const cancelled = (): AniListGatewayError =>
  new AniListGatewayError('The AniList read was cancelled.', {
    kind: 'cancelled',
    retryable: true,
  })

const relations = (value: unknown): RelatedMediaConnection[] => {
  const edges = record(value)?.edges
  if (!Array.isArray(edges)) return []
  return edges.flatMap((edge): RelatedMediaConnection[] => {
    const source = record(edge)
    const node = record(source?.node)
    const id = positiveInteger(node?.id)
    const type = mediaType(node?.type)
    return source && typeof source.relationType === 'string' && id !== null && type
      ? [{ relationType: source.relationType, mediaId: id, mediaType: type }]
      : []
  })
}

const listEntry = (value: unknown): RelatedMediaListEntry | null => {
  const source = record(value)
  const entryId = positiveInteger(source?.id)
  if (!source || entryId === null) return null
  return {
    entryId,
    ...(typeof source.status === 'string'
      ? { status: source.status as MediaListStatus }
      : {}),
    ...(finiteNumber(source.progress) !== undefined
      ? { progress: finiteNumber(source.progress) }
      : {}),
  }
}

const normalizeRelatedMedia = (value: unknown): RelatedMediaRecord | null => {
  const source = record(value)
  const id = positiveInteger(source?.id)
  const type = mediaType(source?.type)
  if (!source || id === null || !type) return null
  const startDate = date(source.startDate)
  const coverImage = cover(source.coverImage)
  return {
    id,
    title: title(source.title),
    type,
    ...(optionalString(source.format) !== undefined
      ? { format: optionalString(source.format) }
      : {}),
    ...(startDate !== undefined ? { startDate } : {}),
    ...(finiteNumber(source.seasonYear) !== undefined
      ? { seasonYear: finiteNumber(source.seasonYear) }
      : {}),
    ...(finiteNumber(source.episodes) !== undefined
      ? { episodes: finiteNumber(source.episodes) }
      : source.episodes === null
        ? { episodes: null }
        : {}),
    ...(finiteNumber(source.chapters) !== undefined
      ? { chapters: finiteNumber(source.chapters) }
      : source.chapters === null
        ? { chapters: null }
        : {}),
    ...(optionalString(source.countryOfOrigin) !== undefined
      ? { countryOfOrigin: optionalString(source.countryOfOrigin) }
      : {}),
    genres: stringList(source.genres),
    ...(coverImage !== undefined ? { coverImage } : {}),
    mediaListEntry: listEntry(source.mediaListEntry),
    relations: relations(source.relations),
  }
}

const chunks = <T>(values: readonly T[], size: number): T[][] => {
  const result: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size))
  }
  return result
}

const relatedEdge = (connection: RelatedMediaConnection, type: MediaType): boolean =>
  (connection.relationType === 'PREQUEL' || connection.relationType === 'SEQUEL') &&
  connection.mediaType === type

export const discoverRelatedSeasonsWithReader = async (
  request: DiscoverRelatedSeasonsRequest,
  read: (
    request: ReadMediaRelationsRequest,
  ) => Promise<readonly RelatedMediaRecord[]>,
): Promise<RelatedSeasonDiscovery> => {
  const maximumNodes = 100
  const visited = new Set<number>([request.seedId])
  const depths = new Map<number, number>([[request.seedId, 0]])
  const records = new Map<number, RelatedMediaRecord>()
  const orderedRelatedIds: number[] = []
  let frontier = [request.seedId]
  let truncated = false

  while (frontier.length > 0) {
    if (request.signal?.aborted) throw cancelled()
    const loaded = await read({
      accountId: request.accountId,
      mediaIds: frontier,
      signal: request.signal,
    })
    loaded.forEach((item) => records.set(item.id, item))
    const next: number[] = []

    for (const currentId of frontier) {
      const current = records.get(currentId)
      if (!current) continue
      if (currentId !== request.seedId) orderedRelatedIds.push(currentId)
      for (const connection of current.relations) {
        if (!relatedEdge(connection, request.mediaType) || visited.has(connection.mediaId)) {
          continue
        }
        if (visited.size >= maximumNodes) {
          truncated = true
          continue
        }
        visited.add(connection.mediaId)
        depths.set(connection.mediaId, (depths.get(currentId) ?? 0) + 1)
        next.push(connection.mediaId)
      }
    }
    frontier = next
  }

  const seed = records.get(request.seedId)
  if (!seed || seed.type !== request.mediaType) {
    throw new AniListGatewayError('The selected seed media was not found.', {
      kind: 'validation',
      retryable: false,
    })
  }

  const nodes: RelatedSeasonPreviewNode[] = orderedRelatedIds.flatMap((id) => {
    const item = records.get(id)
    if (!item || item.type !== request.mediaType) return []
    const knownMaximum = request.mediaType === 'ANIME' ? item.episodes : item.chapters
    return [
      {
        id: item.id,
        title: item.title,
        mediaType: item.type,
        ...(item.format !== undefined ? { format: item.format } : {}),
        ...(item.startDate !== undefined ? { releaseDate: item.startDate } : {}),
        ...(item.seasonYear !== undefined ? { seasonYear: item.seasonYear } : {}),
        ...(item.countryOfOrigin !== undefined
          ? { countryOfOrigin: item.countryOfOrigin }
          : {}),
        genres: item.genres,
        ...(item.coverImage !== undefined
          ? { coverImage: item.coverImage }
          : {}),
        depth: depths.get(id) ?? 0,
        existingListEntry: item.mediaListEntry,
        proposedAction: {
          status: 'COMPLETED',
          ...(typeof knownMaximum === 'number' && knownMaximum > 0
            ? { progress: knownMaximum }
            : {}),
        },
        selectedByDefault: item.mediaListEntry === null,
        connections: item.relations.filter(
          (connection) =>
            relatedEdge(connection, request.mediaType) && visited.has(connection.mediaId),
        ),
      },
    ]
  })

  return { seed, nodes, visitedCount: visited.size, truncated }
}

export class AniListReadFacade {
  constructor(protected readonly readTransport: GraphQLTransport) {}

  async loadMediaListCollection(
    request: LoadMediaListCollectionRequest,
  ): Promise<readonly MediaListCollectionEntry[]> {
    const data = await this.executeRead<{
      MediaListCollection?: { lists?: readonly { entries?: readonly unknown[] }[] }
    }>(request.accountId, COLLECTION_QUERY, {
      userId: request.accountId,
      type: request.mediaType,
    }, request.signal)
    const lists = data.MediaListCollection?.lists
    if (!Array.isArray(lists)) {
      throw new AniListGatewayError('AniList returned an invalid media-list collection.', {
        kind: 'unknown',
        retryable: true,
      })
    }
    // AniList can repeat one entry across status/custom-list sections. Preserve
    // every normalized variant so the canonical workspace can reconcile them.
    const entries: MediaListCollectionEntry[] = []
    lists.forEach((list) => {
      if (!Array.isArray(list.entries)) return
      list.entries.forEach((rawEntry: unknown) => {
        const entry = normalizeCollectionEntry(rawEntry, request.accountId, request.mediaType)
        if (entry) entries.push(entry)
      })
    })
    return entries
  }

  async getMediaListOptionsCatalog(
    request: MediaListOptionsCatalogRequest,
  ): Promise<MediaListOptionsCatalog> {
    const data = await this.executeRead<{
      Viewer?: {
        mediaListOptions?: {
          animeList?: { customLists?: unknown }
          mangaList?: { customLists?: unknown }
        }
      }
    }>(request.accountId, OPTIONS_QUERY, {}, request.signal)
    const options = data.Viewer?.mediaListOptions
    if (!options) {
      throw new AniListGatewayError('AniList returned no media-list options.', {
        kind: 'unknown',
        retryable: true,
      })
    }
    return {
      animeCustomLists: stringList(options.animeList?.customLists),
      mangaCustomLists: stringList(options.mangaList?.customLists),
    }
  }

  async readMediaRelations(
    request: ReadMediaRelationsRequest,
  ): Promise<readonly RelatedMediaRecord[]> {
    const ids = [...new Set(request.mediaIds)].filter(
      (id) => Number.isSafeInteger(id) && id > 0,
    )
    const result: RelatedMediaRecord[] = []
    for (const group of chunks(ids, 50)) {
      if (request.signal?.aborted) throw cancelled()
      const data = await this.executeRead<{ Page?: { media?: readonly unknown[] } }>(
        request.accountId,
        RELATIONS_QUERY,
        { ids: group, perPage: 50 },
        request.signal,
      )
      const returned = Array.isArray(data.Page?.media) ? data.Page.media : []
      const byId = new Map<number, RelatedMediaRecord>()
      returned.forEach((rawMedia) => {
        const normalized = normalizeRelatedMedia(rawMedia)
        if (normalized) byId.set(normalized.id, normalized)
      })
      group.forEach((id) => {
        const item = byId.get(id)
        if (item) result.push(item)
      })
    }
    return result
  }

  discoverRelatedSeasons(
    request: DiscoverRelatedSeasonsRequest,
  ): Promise<RelatedSeasonDiscovery> {
    return discoverRelatedSeasonsWithReader(request, (readRequest) =>
      this.readMediaRelations(readRequest),
    )
  }

  private async executeRead<T>(
    accountId: number,
    query: string,
    variables: Readonly<Record<string, unknown>>,
    signal?: AbortSignal,
  ): Promise<T> {
    if (signal?.aborted) throw cancelled()
    let result: GraphQLResult<T>
    try {
      result = await this.readTransport.execute<T>({
        accountId,
        kind: 'read',
        query,
        variables,
        signal,
      })
    } catch (error) {
      throw normalizeReadError(error)
    }
    if (result.errors.length > 0) {
      const error = result.errors[0]!
      throw classifiedError(error.message, graphQLErrorStatus(error), error)
    }
    if (result.status >= 400) {
      throw classifiedError(`AniList read failed (${result.status}).`, result.status)
    }
    if (result.data === null) {
      throw new AniListGatewayError('AniList returned no data.', {
        kind: 'unknown',
        retryable: true,
      })
    }
    return result.data
  }
}
