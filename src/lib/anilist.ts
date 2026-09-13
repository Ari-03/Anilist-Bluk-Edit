import {
  User,
  MediaList,
  MediaListStatus,
  MediaType,
  Media,
  ScoreFormat,
} from '@/types/anilist'
import { VIEWER_QUERY } from '@/lib/viewerQuery'
import { pacer, sleepUntil } from '@/lib/pacer'
import { AliasResult, AniListRequestError, GraphQLBody, splitAliases } from '@/lib/graphql'

export interface RelationMediaNode {
  id: number
  type: MediaType
  format?: string
  status?: string
  episodes?: number | null
  chapters?: number | null
  isAdult?: boolean
  title?: { userPreferred?: string; romaji?: string }
  coverImage?: { medium?: string; color?: string }
  startDate?: { year?: number | null }
  mediaListEntry?: { id: number; status?: MediaListStatus; progress?: number } | null
}

export interface RelationLookupResult {
  id: number
  relations?: {
    edges?: Array<{
      relationType?: string
      node?: RelationMediaNode
    }> | null
  } | null
}

export interface RequestOptions {
  /** Aborts the pacer wait and any retry sleep. A request already in flight is left to land. */
  signal?: AbortSignal
  /** Retry once on 5xx / network failure. Only for queries and idempotent mutations. */
  retryTransient?: boolean
}

/** Fields a list entry edit can change. `customLists` is the full membership, not a delta. */
export interface EntryUpdates {
  status?: MediaListStatus
  score?: number
  progress?: number
  progressVolumes?: number
  repeat?: number
  priority?: number
  private?: boolean
  notes?: string
  hiddenFromStatusLists?: boolean
  customLists?: string[]
  advancedScores?: Record<string, number>
  startedAt?: { year?: number; month?: number; day?: number }
  completedAt?: { year?: number; month?: number; day?: number }
}

type Variables = Record<string, unknown>

const MAX_RATE_LIMIT_RETRIES = 2
const MAX_TRANSIENT_RETRIES = 1
const TRANSIENT_RETRY_DELAY_MS = 1000

// Every mutation returns this so settled updates cover each field the forms can edit
const ENTRY_FIELDS = `
  id
  mediaId
  status
  score
  progress
  progressVolumes
  repeat
  priority
  private
  notes
  hiddenFromStatusLists
  customLists
  advancedScores
  startedAt { year month day }
  completedAt { year month day }
  updatedAt
  media { id title { userPreferred } }
`

export class AniListClient {
  private accessToken?: string

  constructor(accessToken?: string) {
    this.accessToken = accessToken
  }

  /**
   * One paced, retrying round-trip. Every AniList call in the app goes through
   * here, so the shared pacer sees every request and every rate-limit header.
   * Returns the raw body (partial data included); throws only when there is no
   * data at all.
   */
  private async exchange<T>(query: string, variables?: Variables, opts: RequestOptions = {}): Promise<GraphQLBody<T>> {
    let rateLimitRetries = 0
    let transientRetries = 0

    for (;;) {
      await sleepUntil(pacer.reserve(), opts.signal)

      let response: Response
      try {
        response = await fetch('/api/anilist/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, variables, token: this.accessToken }),
        })
      } catch (error) {
        if (opts.retryTransient && transientRetries++ < MAX_TRANSIENT_RETRIES) {
          await sleepUntil(Date.now() + TRANSIENT_RETRY_DELAY_MS, opts.signal)
          continue
        }
        throw error
      }

      pacer.observe(response.status, response.headers)

      // The pacer already holds the Retry-After horizon; just go around again
      if (response.status === 429 && rateLimitRetries++ < MAX_RATE_LIMIT_RETRIES) continue

      if (response.status >= 500 && opts.retryTransient && transientRetries++ < MAX_TRANSIENT_RETRIES) {
        await sleepUntil(Date.now() + TRANSIENT_RETRY_DELAY_MS, opts.signal)
        continue
      }

      const body = (await response.json()) as GraphQLBody<T>
      if (!body.data) {
        throw new AniListRequestError(
          response.status,
          body.errors ?? [{ message: `AniList request failed (${response.status})`, status: response.status }]
        )
      }
      return body
    }
  }

  /** Strict variant: any GraphQL error is a failure, even alongside partial data. */
  private async request<T>(query: string, variables?: Variables, opts?: RequestOptions): Promise<T> {
    const body = await this.exchange<T>(query, variables, opts)
    if (body.errors?.length) throw new AniListRequestError(200, body.errors)
    return body.data as T
  }

  async getCurrentUser(opts?: RequestOptions): Promise<User> {
    const data = await this.request<{ Viewer: User }>(VIEWER_QUERY, undefined, { retryTransient: true, ...opts })
    return data.Viewer
  }

  async getAllMediaLists(userId: number, type: MediaType, opts?: RequestOptions): Promise<MediaList[]> {
    const query = `
      query GetAllMediaLists($userId: Int!, $type: MediaType!) {
        MediaListCollection(userId: $userId, type: $type) {
          lists {
            name
            status
            entries {
              id
              mediaId
              status
              score
              progress
              progressVolumes
              repeat
              priority
              private
              notes
              hiddenFromStatusLists
              customLists
              advancedScores
              startedAt { year month day }
              completedAt { year month day }
              updatedAt
              createdAt
              media {
                id
                idMal
                title { romaji english native userPreferred }
                type
                format
                status
                description
                startDate { year month day }
                endDate { year month day }
                season
                seasonYear
                episodes
                duration
                chapters
                volumes
                genres
                averageScore
                popularity
                coverImage { large medium color }
                bannerImage
                tags { id name description category rank isGeneralSpoiler isMediaSpoiler isAdult }
                nextAiringEpisode { airingAt timeUntilAiring episode }
                siteUrl
                isAdult
                countryOfOrigin
              }
            }
          }
        }
      }
    `

    const data = await this.request<{
      MediaListCollection: { lists: { entries: MediaList[] }[] }
    }>(query, { userId, type }, { retryTransient: true, ...opts })

    return data.MediaListCollection.lists.flatMap((list) => list.entries)
  }

  /** Save one entry (creates it when `mediaId` is not on the list yet). Idempotent, so retried on 5xx. */
  async updateMediaListEntry(mediaId: number, updates: EntryUpdates, opts?: RequestOptions): Promise<MediaList> {
    const mutation = `
      mutation UpdateMediaListEntry(
        $mediaId: Int
        $status: MediaListStatus
        $score: Float
        $progress: Int
        $progressVolumes: Int
        $repeat: Int
        $priority: Int
        $private: Boolean
        $notes: String
        $hiddenFromStatusLists: Boolean
        $customLists: [String]
        $advancedScores: [Float]
        $startedAt: FuzzyDateInput
        $completedAt: FuzzyDateInput
      ) {
        SaveMediaListEntry(
          mediaId: $mediaId
          status: $status
          score: $score
          progress: $progress
          progressVolumes: $progressVolumes
          repeat: $repeat
          priority: $priority
          private: $private
          notes: $notes
          hiddenFromStatusLists: $hiddenFromStatusLists
          customLists: $customLists
          advancedScores: $advancedScores
          startedAt: $startedAt
          completedAt: $completedAt
        ) { ${ENTRY_FIELDS} }
      }
    `

    const data = await this.request<{ SaveMediaListEntry: MediaList }>(
      mutation,
      { mediaId, ...updates },
      { retryTransient: true, ...opts }
    )
    return data.SaveMediaListEntry
  }

  /**
   * Fast path: one request updates the same fields on many entries. AniList
   * silently drops IDs it does not update, so callers must intersect the
   * returned IDs with what they sent. No customLists argument exists here.
   */
  async updateMediaListEntries(
    ids: number[],
    updates: Pick<EntryUpdates, 'status' | 'score' | 'progress' | 'private' | 'notes' | 'hiddenFromStatusLists'>,
    opts?: RequestOptions
  ): Promise<MediaList[]> {
    const mutation = `
      mutation UpdateMediaListEntries(
        $ids: [Int]
        $status: MediaListStatus
        $score: Float
        $progress: Int
        $private: Boolean
        $notes: String
        $hiddenFromStatusLists: Boolean
      ) {
        UpdateMediaListEntries(
          ids: $ids
          status: $status
          score: $score
          progress: $progress
          private: $private
          notes: $notes
          hiddenFromStatusLists: $hiddenFromStatusLists
        ) { ${ENTRY_FIELDS} }
      }
    `

    const { status, score, progress, private: isPrivate, notes, hiddenFromStatusLists } = updates
    const data = await this.request<{ UpdateMediaListEntries: MediaList[] }>(
      mutation,
      { ids, status, score, progress, private: isPrivate, notes, hiddenFromStatusLists },
      { retryTransient: true, ...opts }
    )
    return data.UpdateMediaListEntries ?? []
  }

  /**
   * Aliased batch of SaveMediaListEntry (up to ~10 per request). Results come
   * back in input order, one per entry, so one bad entry no longer fails the
   * batch. Idempotent, so retried on 5xx.
   */
  async bulkSaveMediaListEntries(
    entries: Array<{ mediaId: number; updates: EntryUpdates }>,
    opts?: RequestOptions
  ): Promise<AliasResult<MediaList>[]> {
    if (entries.length === 0) return []

    const defs = entries.map((_, i) => `
      $mediaId${i}: Int, $status${i}: MediaListStatus, $score${i}: Float, $progress${i}: Int,
      $private${i}: Boolean, $notes${i}: String, $hiddenFromStatusLists${i}: Boolean, $customLists${i}: [String]
    `).join('\n')

    const fields = entries.map((_, i) => `
      entry${i}: SaveMediaListEntry(
        mediaId: $mediaId${i}, status: $status${i}, score: $score${i}, progress: $progress${i},
        private: $private${i}, notes: $notes${i}, hiddenFromStatusLists: $hiddenFromStatusLists${i}, customLists: $customLists${i}
      ) { ${ENTRY_FIELDS} }
    `).join('\n')

    const variables: Variables = {}
    entries.forEach(({ mediaId, updates }, i) => {
      variables[`mediaId${i}`] = mediaId
      variables[`status${i}`] = updates.status
      variables[`score${i}`] = updates.score
      variables[`progress${i}`] = updates.progress
      variables[`private${i}`] = updates.private
      variables[`notes${i}`] = updates.notes
      variables[`hiddenFromStatusLists${i}`] = updates.hiddenFromStatusLists
      variables[`customLists${i}`] = updates.customLists
    })

    const body = await this.exchange<Record<string, MediaList | null>>(
      `mutation (${defs}) { ${fields} }`,
      variables,
      { retryTransient: true, ...opts }
    )
    return splitAliases(body, entries.map((_, i) => `entry${i}`))
  }

  async deleteMediaListEntry(id: number, opts?: RequestOptions): Promise<{ deleted: boolean }> {
    const mutation = `
      mutation DeleteMediaListEntry($id: Int!) {
        DeleteMediaListEntry(id: $id) { deleted }
      }
    `
    const data = await this.request<{ DeleteMediaListEntry: { deleted: boolean } }>(mutation, { id }, opts)
    return data.DeleteMediaListEntry
  }

  /** Aliased batch of DeleteMediaListEntry. Results come back in input order. */
  async bulkDeleteMediaListEntries(ids: number[], opts?: RequestOptions): Promise<AliasResult<{ deleted: boolean }>[]> {
    if (ids.length === 0) return []

    const defs = ids.map((_, i) => `$id${i}: Int!`).join(', ')
    const fields = ids.map((_, i) => `d${i}: DeleteMediaListEntry(id: $id${i}) { deleted }`).join('\n')
    const variables = Object.fromEntries(ids.map((id, i) => [`id${i}`, id]))

    const body = await this.exchange<Record<string, { deleted: boolean } | null>>(
      `mutation (${defs}) { ${fields} }`,
      variables,
      opts
    )
    return splitAliases(body, ids.map((_, i) => `d${i}`))
  }

  /**
   * Batched relations lookup: one aliased query fetches PREQUEL/SEQUEL (and
   * other) edges for up to ~12 media ids. `mediaListEntry` on each node is
   * viewer-scoped, so the caller learns the current list status for free.
   */
  async getMediaRelations(mediaIds: number[], opts?: RequestOptions): Promise<RelationLookupResult[]> {
    if (mediaIds.length === 0) return []

    const varDefs = mediaIds.map((_, i) => `$id${i}: Int`).join(', ')
    const aliases = mediaIds.map((_, i) => `
      m${i}: Media(id: $id${i}) {
        id
        relations {
          edges {
            relationType
            node {
              id
              type
              format
              status
              episodes
              chapters
              isAdult
              title { userPreferred romaji }
              coverImage { medium color }
              startDate { year }
              mediaListEntry { id status progress }
            }
          }
        }
      }
    `).join('\n')

    const variables = Object.fromEntries(mediaIds.map((id, i) => [`id${i}`, id]))
    const body = await this.exchange<Record<string, RelationLookupResult | null>>(
      `query (${varDefs}) { ${aliases} }`,
      variables,
      { retryTransient: true, ...opts }
    )
    // A missing/private media id nulls its alias; skip it rather than fail the round
    return Object.values(body.data ?? {}).filter((m): m is RelationLookupResult => m !== null)
  }

  async searchMedia(
    search: string,
    type: MediaType,
    page: number = 1,
    perPage: number = 20,
    opts?: RequestOptions
  ): Promise<{ media: Media[]; pageInfo: { hasNextPage: boolean; total: number } }> {
    const query = `
      query SearchMedia($search: String!, $type: MediaType!, $page: Int!, $perPage: Int!) {
        Page(page: $page, perPage: $perPage) {
          pageInfo { hasNextPage total }
          media(search: $search, type: $type, sort: POPULARITY_DESC) {
            id
            idMal
            title { romaji english native userPreferred }
            type
            format
            status
            description
            startDate { year month day }
            endDate { year month day }
            season
            seasonYear
            episodes
            duration
            chapters
            volumes
            genres
            averageScore
            popularity
            coverImage { large medium color }
            bannerImage
            siteUrl
            isAdult
            mediaListEntry { id status score progress progressVolumes }
          }
        }
      }
    `

    const data = await this.request<{
      Page: { pageInfo: { hasNextPage: boolean; total: number }; media: Media[] }
    }>(query, { search, type, page, perPage }, { retryTransient: true, ...opts })

    return { media: data.Page.media, pageInfo: data.Page.pageInfo }
  }
}

// Utility functions
export const getScoreDisplay = (score: number, format: ScoreFormat): string => {
  switch (format) {
    case ScoreFormat.POINT_100:
      return score.toString()
    case ScoreFormat.POINT_10_DECIMAL:
      return (score / 10).toFixed(1)
    case ScoreFormat.POINT_10:
      return Math.round(score / 10).toString()
    case ScoreFormat.POINT_5:
      return Math.round(score / 20).toString()
    case ScoreFormat.POINT_3:
      if (score >= 85) return '😊'
      if (score >= 60) return '😐'
      if (score > 0) return '😞'
      return ''
    default:
      return score.toString()
  }
}

export const getStatusColor = (status: MediaListStatus): string => {
  switch (status) {
    case MediaListStatus.CURRENT:
      return 'bg-status-current'
    case MediaListStatus.PLANNING:
      return 'bg-status-planning'
    case MediaListStatus.COMPLETED:
      return 'bg-status-completed'
    case MediaListStatus.DROPPED:
      return 'bg-status-dropped'
    case MediaListStatus.PAUSED:
      return 'bg-status-paused'
    case MediaListStatus.REPEATING:
      return 'bg-status-repeating'
    default:
      return 'bg-fg-subtle'
  }
}

// Text color counterpart (chips, dots) for an entry status
export const getStatusTextColor = (status: MediaListStatus): string => {
  switch (status) {
    case MediaListStatus.CURRENT:
      return 'text-status-current'
    case MediaListStatus.PLANNING:
      return 'text-status-planning'
    case MediaListStatus.COMPLETED:
      return 'text-status-completed'
    case MediaListStatus.DROPPED:
      return 'text-status-dropped'
    case MediaListStatus.PAUSED:
      return 'text-status-paused'
    case MediaListStatus.REPEATING:
      return 'text-status-repeating'
    default:
      return 'text-fg-subtle'
  }
}

export const getStatusLabel = (status: MediaListStatus, mediaType?: MediaType): string => {
  switch (status) {
    case MediaListStatus.CURRENT:
      return mediaType === MediaType.MANGA ? 'Reading' : 'Watching'
    case MediaListStatus.PLANNING:
      return 'Planning'
    case MediaListStatus.COMPLETED:
      return 'Completed'
    case MediaListStatus.DROPPED:
      return 'Dropped'
    case MediaListStatus.PAUSED:
      return 'Paused'
    case MediaListStatus.REPEATING:
      return mediaType === MediaType.MANGA ? 'Re-reading' : 'Rewatching'
    default:
      return 'Unknown'
  }
}
