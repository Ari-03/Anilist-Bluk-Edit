import {
  User,
  MediaList,
  MediaListStatus,
  MediaType,
  Media,
  ScoreFormat,
} from '@/types/anilist'
import { VIEWER_QUERY } from '@/lib/viewerQuery'
import { isAbortError, pacer, sleepUntil } from '@/lib/pacer'
import { AliasResult, AniListRequestError, GraphQLBody, isAlreadyDeleted, splitAliases } from '@/lib/graphql'

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
  /** Retry once on 5xx / timeout. Only for queries and idempotent mutations. */
  retryTransient?: boolean
  /**
   * Never re-send after a network-level failure. For toggles: if the request
   * landed and only the reply was lost, a second send would undo it.
   */
  noResend?: boolean
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

const parseBody = <T,>(text: string): GraphQLBody<T> => {
  try {
    return JSON.parse(text) as GraphQLBody<T>
  } catch {
    return { data: null }
  }
}

/**
 * Builds an aliased document with one alias per line so error `locations`
 * map back to an alias (see splitAliases). Whitespace inside each field is
 * collapsed, so multi-line selection sets are fine; `defs` must be one line.
 */
function aliasedDocument(kind: 'query' | 'mutation', defs: string, fields: string[]) {
  const query = [`${kind} (${defs}) {`, ...fields.map(f => f.replace(/\s+/g, ' ').trim()), '}'].join('\n')
  return { query, aliasLines: fields.map((_, i) => i + 2) }
}

const ANILIST_URL = 'https://graphql.anilist.co'

const MAX_RATE_LIMIT_RETRIES = 2
const MAX_TRANSIENT_RETRIES = 1
const TRANSIENT_RETRY_DELAY_MS = 1000
/** A request still unanswered after this is treated like a 5xx (retried only when idempotent) */
const REQUEST_TIMEOUT_MS = 30_000
/** AniList's 429 carries Retry-After: 60, but the browser can't read it (see exchange) */
const OPAQUE_FAILURE_PENALTY_MS = 61_000

// Every mutation returns this so settled updates cover each field the forms can edit
const RELATION_FIELDS = `
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
`

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
   * One paced, retrying round-trip straight to AniList. Every AniList call in
   * the app goes through here, so the shared pacer sees every request and
   * every rate-limit header. Returns the raw body (partial data included);
   * throws only when there is no data at all.
   */
  private async exchange<T>(query: string, variables?: Variables, opts: RequestOptions = {}): Promise<GraphQLBody<T>> {
    let rateLimitRetries = 0
    let transientRetries = 0

    for (;;) {
      await pacer.acquire(opts.signal)

      let response: Response
      let text: string
      try {
        response = await fetch(ANILIST_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
          },
          body: JSON.stringify({ query, variables }),
          // Deliberately not opts.signal: Stop lets an in-flight request land
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
        // Inside the try: the timeout also covers a body that stalls mid-read
        text = await response.text()
      } catch (error) {
        const timedOut = error instanceof DOMException && error.name === 'TimeoutError'
        if (timedOut) {
          if (opts.retryTransient && transientRetries++ < MAX_TRANSIENT_RETRIES) continue
          throw new AniListRequestError(408, [{ message: 'AniList did not respond in time', status: 408 }])
        }
        // AniList's 429 has no CORS headers, so the browser reports it as a
        // network error. Offline is the only failure we can tell apart from it;
        // anything else is treated as a rate limit. A 429 means the request was
        // never run, and every mutation here is safe to re-send anyway.
        if (typeof navigator !== 'undefined' && navigator.onLine === false) throw error
        // Penalize even when giving up, so queued requests still back off
        pacer.penalize(Date.now() + OPAQUE_FAILURE_PENALTY_MS)
        if (!opts.noResend && rateLimitRetries++ < MAX_RATE_LIMIT_RETRIES) continue
        throw new AniListRequestError(429, [{ message: 'AniList is rate limiting requests. Try again in a minute.', status: 429 }])
      }

      pacer.observe(response.status, response.headers)

      // The pacer already holds the Retry-After horizon; just go around again
      if (response.status === 429 && rateLimitRetries++ < MAX_RATE_LIMIT_RETRIES) continue

      if (response.status >= 500 && opts.retryTransient && transientRetries++ < MAX_TRANSIENT_RETRIES) {
        await sleepUntil(Date.now() + TRANSIENT_RETRY_DELAY_MS, opts.signal)
        continue
      }

      // Cloudflare answers some failures with an HTML page; keep the status
      const body = parseBody<T>(text)
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

  /**
   * Runs an aliased batch and, when AniList aborted it because of one alias,
   * re-sends the aliases that were never attempted without the culprit. Each
   * round drops at least one item, so k bad entries cost k extra requests
   * instead of failing the whole batch. Stop during a re-send round returns
   * what already settled (the rest stay "not attempted") instead of losing it.
   */
  private async settleAliased<I, T>(
    items: I[],
    send: (items: I[]) => Promise<AliasResult<T>[]>
  ): Promise<AliasResult<T>[]> {
    if (items.length === 0) return []
    const results = await send(items)
    const blamed = results.some(r => !r.ok && r.blamed)
    const untried = results.flatMap((r, i) => (!r.ok && !r.blamed ? [i] : []))
    if (!blamed || untried.length === 0) return results

    let retried: AliasResult<T>[]
    try {
      retried = await this.settleAliased(untried.map(i => items[i]), send)
    } catch (error) {
      if (isAbortError(error)) return results
      throw error
    }
    untried.forEach((i, k) => {
      results[i] = { ...retried[k], alias: results[i].alias }
    })
    return results
  }

  async getCurrentUser(opts?: RequestOptions): Promise<User> {
    const data = await this.request<{ Viewer: User }>(VIEWER_QUERY, undefined, { retryTransient: true, ...opts })
    return data.Viewer
  }

  /**
   * Whole collection in one request. Only fields the UI renders are selected:
   * descriptions and tags alone pushed a 400-entry list past 4 MB.
   */
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
                title { romaji english native userPreferred }
                type
                format
                status
                startDate { year month day }
                season
                seasonYear
                episodes
                duration
                chapters
                volumes
                genres
                coverImage { large medium color }
                siteUrl
                countryOfOrigin
                isFavourite
                isFavouriteBlocked
              }
            }
          }
        }
      }
    `

    const data = await this.request<{
      MediaListCollection: { lists: { entries: MediaList[] }[] }
    }>(query, { userId, type }, { retryTransient: true, ...opts })

    // An entry on a custom list is returned under that list too; keep one copy
    // per id or bulk runs would process (and count) it twice.
    const byId = new Map(data.MediaListCollection.lists.flatMap(list => list.entries).map(e => [e.id, e]))
    return Array.from(byId.values())
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
   * back in input order, one per entry; a rejected entry is blamed and the
   * rest are re-sent without it. Idempotent, so retried on 5xx.
   */
  async bulkSaveMediaListEntries(
    entries: Array<{ mediaId: number; updates: EntryUpdates }>,
    opts?: RequestOptions
  ): Promise<AliasResult<MediaList>[]> {
    return this.settleAliased(entries, async batch => {
      const defs = batch.map((_, i) =>
        `$mediaId${i}: Int, $status${i}: MediaListStatus, $score${i}: Float, $progress${i}: Int, ` +
        `$private${i}: Boolean, $notes${i}: String, $hiddenFromStatusLists${i}: Boolean, $customLists${i}: [String]`
      ).join(', ')
      const fields = batch.map((_, i) =>
        `entry${i}: SaveMediaListEntry(mediaId: $mediaId${i}, status: $status${i}, score: $score${i}, progress: $progress${i}, ` +
        `private: $private${i}, notes: $notes${i}, hiddenFromStatusLists: $hiddenFromStatusLists${i}, customLists: $customLists${i}) { ${ENTRY_FIELDS} }`
      )

      const variables: Variables = {}
      batch.forEach(({ mediaId, updates }, i) => {
        variables[`mediaId${i}`] = mediaId
        variables[`status${i}`] = updates.status
        variables[`score${i}`] = updates.score
        variables[`progress${i}`] = updates.progress
        variables[`private${i}`] = updates.private
        variables[`notes${i}`] = updates.notes
        variables[`hiddenFromStatusLists${i}`] = updates.hiddenFromStatusLists
        variables[`customLists${i}`] = updates.customLists
      })

      const { query, aliasLines } = aliasedDocument('mutation', defs, fields)
      const body = await this.exchange<Record<string, MediaList | null>>(query, variables, { retryTransient: true, ...opts })
      return splitAliases(body, batch.map((_, i) => `entry${i}`), aliasLines)
    })
  }

  /** An entry that is already gone (e.g. a re-send after a lost reply) counts as deleted */
  /**
   * Aliased ToggleFavourite, one alias per media. AniList only flips the
   * current state, so callers send just the media that differ (planFavourites)
   * and nothing is ever re-sent: a batch AniList aborted may have flipped some
   * entries anyway, so failures leave the state unknown until a refetch.
   */
  async toggleFavourites(
    media: Array<{ id: number; type: MediaType }>,
    opts?: RequestOptions
  ): Promise<AliasResult<{ __typename: string }>[]> {
    if (media.length === 0) return []
    const defs = media.map((_, i) => `$id${i}: Int`).join(', ')
    const fields = media.map((m, i) =>
      `f${i}: ToggleFavourite(${m.type === MediaType.MANGA ? 'mangaId' : 'animeId'}: $id${i}) { __typename }`
    )
    const variables = Object.fromEntries(media.map((m, i) => [`id${i}`, m.id]))

    const { query, aliasLines } = aliasedDocument('mutation', defs, fields)
    const body = await this.exchange<Record<string, { __typename: string } | null>>(query, variables, { ...opts, noResend: true })
    return splitAliases(body, media.map((_, i) => `f${i}`), aliasLines)
  }

  async deleteMediaListEntry(id: number, opts?: RequestOptions): Promise<{ deleted: boolean }> {
    const mutation = `
      mutation DeleteMediaListEntry($id: Int!) {
        DeleteMediaListEntry(id: $id) { deleted }
      }
    `
    try {
      const data = await this.request<{ DeleteMediaListEntry: { deleted: boolean } }>(mutation, { id }, opts)
      return data.DeleteMediaListEntry
    } catch (error) {
      if (error instanceof Error && isAlreadyDeleted(error.message)) return { deleted: true }
      throw error
    }
  }

  /**
   * Aliased batch of DeleteMediaListEntry. Results come back in input order.
   * AniList runs the deletes in order and still aborts the response on a bad
   * id, so an entry reported as not attempted may already be gone; the
   * re-send then blames it as invalid, which callers treat as deleted.
   */
  async bulkDeleteMediaListEntries(ids: number[], opts?: RequestOptions): Promise<AliasResult<{ deleted: boolean }>[]> {
    return this.settleAliased(ids, async batch => {
      const defs = batch.map((_, i) => `$id${i}: Int!`).join(', ')
      const fields = batch.map((_, i) => `d${i}: DeleteMediaListEntry(id: $id${i}) { deleted }`)
      const variables = Object.fromEntries(batch.map((id, i) => [`id${i}`, id]))

      const { query, aliasLines } = aliasedDocument('mutation', defs, fields)
      const body = await this.exchange<Record<string, { deleted: boolean } | null>>(query, variables, opts)
      return splitAliases(body, batch.map((_, i) => `d${i}`), aliasLines)
    })
  }

  /**
   * Batched relations lookup: one aliased query fetches PREQUEL/SEQUEL (and
   * other) edges for up to ~12 media ids. `mediaListEntry` on each node is
   * viewer-scoped, so the caller learns the current list status for free.
   */
  async getMediaRelations(mediaIds: number[], opts?: RequestOptions): Promise<RelationLookupResult[]> {
    const results = await this.settleAliased(mediaIds, async batch => {
      const defs = batch.map((_, i) => `$id${i}: Int`).join(', ')
      const fields = batch.map((_, i) => `m${i}: Media(id: $id${i}) { ${RELATION_FIELDS} }`)
      const variables = Object.fromEntries(batch.map((id, i) => [`id${i}`, id]))

      const { query, aliasLines } = aliasedDocument('query', defs, fields)
      const body = await this.exchange<Record<string, RelationLookupResult | null>>(query, variables, { retryTransient: true, ...opts })
      return splitAliases(body, batch.map((_, i) => `m${i}`), aliasLines)
    })
    // A missing/private media id is blamed and dropped; the rest still resolve
    return results.flatMap(r => (r.ok ? [r.data] : []))
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
