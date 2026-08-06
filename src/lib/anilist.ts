import {
  User,
  MediaList,
  MediaListStatus,
  MediaType,
  MediaListOptions,
  Media,
  ScoreFormat,
} from '@/types/anilist'
import { VIEWER_QUERY } from '@/lib/viewerQuery'

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

export class AniListClient {
  private accessToken?: string

  constructor(accessToken?: string) {
    this.accessToken = accessToken
  }

  private async request<T>(query: string, variables?: any): Promise<T> {
    const response = await fetch('/api/anilist/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables,
        token: this.accessToken,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      // Create an error that includes the status code for proper rate limit handling
      const error = new Error(data.error || 'GraphQL request failed') as any
      error.status = response.status
      error.response = { status: response.status, data }
      error.details = data.details || []
      throw error
    }

    if (data.errors) {
      const error = new Error(data.errors.map((e: any) => e.message).join(', ')) as any
      error.graphQLErrors = data.errors
      throw error
    }

    return data.data
  }

  async getCurrentUser(): Promise<User> {
    const data = await this.request<{ Viewer: User }>(VIEWER_QUERY)
    return data.Viewer
  }

  async getMediaListCollection(
    userId: number,
    type: MediaType,
    status?: MediaListStatus
  ): Promise<MediaList[]> {
    const query = `
      query GetMediaListCollection($userId: Int!, $type: MediaType!, $status: MediaListStatus) {
        MediaListCollection(userId: $userId, type: $type, status: $status) {
          lists {
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
              startedAt {
                year
                month
                day
              }
              completedAt {
                year
                month
                day
              }
              updatedAt
              createdAt
              media {
                id
                idMal
                title {
                  romaji
                  english
                  native
                  userPreferred
                }
                type
                format
                status
                description
                startDate {
                  year
                  month
                  day
                }
                endDate {
                  year
                  month
                  day
                }
                season
                seasonYear
                episodes
                duration
                chapters
                volumes
                genres
                averageScore
                popularity
                coverImage {
                  large
                  medium
                  color
                }
                bannerImage
                tags {
                  id
                  name
                  description
                  category
                  rank
                  isGeneralSpoiler
                  isMediaSpoiler
                  isAdult
                }
                nextAiringEpisode {
                  airingAt
                  timeUntilAiring
                  episode
                }
                siteUrl
                isAdult
                countryOfOrigin
              }
            }
          }
        }
      }
    `

    const variables = { userId, type, status }
    const data = await this.request<{
      MediaListCollection: { lists: { entries: MediaList[] }[] }
    }>(query, variables)

    return data.MediaListCollection.lists.flatMap((list) => list.entries)
  }

  async getAllMediaLists(userId: number, type: MediaType): Promise<MediaList[]> {
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
              startedAt {
                year
                month
                day
              }
              completedAt {
                year
                month
                day
              }
              updatedAt
              createdAt
              media {
                id
                idMal
                title {
                  romaji
                  english
                  native
                  userPreferred
                }
                type
                format
                status
                description
                startDate {
                  year
                  month
                  day
                }
                endDate {
                  year
                  month
                  day
                }
                season
                seasonYear
                episodes
                duration
                chapters
                volumes
                genres
                averageScore
                popularity
                coverImage {
                  large
                  medium
                  color
                }
                bannerImage
                tags {
                  id
                  name
                  description
                  category
                  rank
                  isGeneralSpoiler
                  isMediaSpoiler
                  isAdult
                }
                nextAiringEpisode {
                  airingAt
                  timeUntilAiring
                  episode
                }
                siteUrl
                isAdult
                countryOfOrigin
              }
            }
          }
        }
      }
    `

    const variables = { userId, type }
    const data = await this.request<{
      MediaListCollection: { lists: { entries: MediaList[] }[] }
    }>(query, variables)

    return data.MediaListCollection.lists.flatMap((list) => list.entries)
  }

  async updateMediaListEntry(
    mediaId: number, // Changed to mediaId
    updates: Partial<{
      id?: number
      status: MediaListStatus
      score: number
      progress: number
      progressVolumes: number
      repeat: number
      priority: number
      private: boolean
      notes: string
      hiddenFromStatusLists: boolean
      customLists: string[]
      advancedScores: Record<string, number>
      startedAt: { year?: number; month?: number; day?: number }
      completedAt: { year?: number; month?: number; day?: number }
    }>
  ): Promise<MediaList> {
    const mutation = `
      mutation UpdateMediaListEntry(
        $id: Int
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
          id: $id
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
        ) {
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
          startedAt {
            year
            month
            day
          }
          completedAt {
            year
            month
            day
          }
          updatedAt
          media {
            id
            title {
              userPreferred
            }
          }
        }
      }
    `

    const variables = { mediaId, ...updates } // Use mediaId directly
    const data = await this.request<{
      SaveMediaListEntry: MediaList
    }>(mutation, variables)

    return data.SaveMediaListEntry
  }

  async updateMediaListEntries(
    ids: number[],
    updates: Partial<{
      status: MediaListStatus
      score: number
      progress: number
      private: boolean
      notes: string
      hiddenFromStatusLists: boolean
    }>
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
        ) {
          id
          mediaId
          status
          score
          progress
          updatedAt
          media {
            id
            title {
              userPreferred
            }
          }
        }
      }
    `

    const variables = { ids, ...updates }
    const data = await this.request<{
      UpdateMediaListEntries: MediaList[]
    }>(mutation, variables)

    return data.UpdateMediaListEntries
  }

  /**
   * Batched relations lookup: one aliased query fetches PREQUEL/SEQUEL (and
   * other) edges for up to ~12 media ids. `mediaListEntry` on each node is
   * viewer-scoped, so the caller learns the current list status for free.
   */
  async getMediaRelations(mediaIds: number[]): Promise<RelationLookupResult[]> {
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

    const query = `query (${varDefs}) { ${aliases} }`
    const variables = mediaIds.reduce((acc, id, i) => {
      acc[`id${i}`] = id
      return acc
    }, {} as Record<string, number>)

    const data = await this.request<Record<string, RelationLookupResult | null>>(query, variables)
    return Object.values(data).filter((m): m is RelationLookupResult => m !== null)
  }

  private isRateLimitError(error: any): boolean {
    // Check for HTTP 429 status
    if (error?.response?.status === 429 || error?.status === 429) {
      return true
    }
    
    // Check for AniList-specific rate limit messages
    const errorMessage = error?.message?.toLowerCase() || ''
    const responseText = error?.response?.data?.toString?.()?.toLowerCase() || ''
    const details = error?.details || []
    
    // Check error details from our proxy
    const hasRateLimitInDetails = details.some((detail: any) => 
      detail?.message?.toLowerCase?.()?.includes('rate limit') ||
      detail?.message?.toLowerCase?.()?.includes('too many requests')
    )
    
    return errorMessage.includes('rate limit') ||
      errorMessage.includes('too many requests') ||
      responseText.includes('rate limit') ||
      responseText.includes('too many requests') ||
      // AniList sometimes returns these
      errorMessage.includes('throttled') ||
      responseText.includes('throttled') ||
      hasRateLimitInDetails
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async bulkSaveMediaListEntries(
    entries: {
      mediaId: number,
      updates: Partial<{
        status: MediaListStatus
        score: number
        progress: number
        private: boolean
        notes: string
        hiddenFromStatusLists: boolean
        customLists: string[]
      }>
    }[]
  ): Promise<MediaList[]> {
    const mutationDefs = entries.map((_, i) => `
      $mediaId${i}: Int,
      $status${i}: MediaListStatus,
      $score${i}: Float,
      $progress${i}: Int,
      $private${i}: Boolean,
      $notes${i}: String,
      $hiddenFromStatusLists${i}: Boolean,
      $customLists${i}: [String]
    `).join('\n');

    const mutations = entries.map((_, i) => `
      entry${i}: SaveMediaListEntry(
        mediaId: $mediaId${i},
        status: $status${i},
        score: $score${i},
        progress: $progress${i},
        private: $private${i},
        notes: $notes${i},
        hiddenFromStatusLists: $hiddenFromStatusLists${i},
        customLists: $customLists${i}
      ) {
        id mediaId status score progress customLists updatedAt
      }
    `).join('\n');

    const fullMutation = `mutation(${mutationDefs}) { ${mutations} }`;

    const variables = entries.reduce((acc, entry, i) => {
      acc[`mediaId${i}`] = entry.mediaId;
      acc[`status${i}`] = entry.updates.status;
      acc[`score${i}`] = entry.updates.score;
      acc[`progress${i}`] = entry.updates.progress;
      acc[`private${i}`] = entry.updates.private;
      acc[`notes${i}`] = entry.updates.notes;
      acc[`hiddenFromStatusLists${i}`] = entry.updates.hiddenFromStatusLists;
      acc[`customLists${i}`] = entry.updates.customLists;
      return acc;
    }, {} as Record<string, any>);

    const data = await this.request<any>(fullMutation, variables);

    return Object.values(data);
  }

  

  async deleteMediaListEntry(id: number): Promise<{ deleted: boolean }> {
    const mutation = `
      mutation DeleteMediaListEntry($id: Int!) {
        DeleteMediaListEntry(id: $id) {
          deleted
        }
      }
    `

    const variables = { id }
    const data = await this.request<{
      DeleteMediaListEntry: { deleted: boolean }
    }>(mutation, variables)

    return data.DeleteMediaListEntry
  }

  async searchMedia(
    search: string,
    type: MediaType,
    page: number = 1,
    perPage: number = 20
  ): Promise<{ media: Media[]; pageInfo: { hasNextPage: boolean; total: number } }> {
    const query = `
      query SearchMedia($search: String!, $type: MediaType!, $page: Int!, $perPage: Int!) {
        Page(page: $page, perPage: $perPage) {
          pageInfo {
            hasNextPage
            total
          }
          media(search: $search, type: $type, sort: POPULARITY_DESC) {
            id
            idMal
            title {
              romaji
              english
              native
              userPreferred
            }
            type
            format
            status
            description
            startDate {
              year
              month
              day
            }
            endDate {
              year
              month
              day
            }
            season
            seasonYear
            episodes
            duration
            chapters
            volumes
            genres
            averageScore
            popularity
            coverImage {
              large
              medium
              color
            }
            bannerImage
            siteUrl
            isAdult
            mediaListEntry {
              id
              status
              score
              progress
              progressVolumes
            }
          }
        }
      }
    `

    const variables = { search, type, page, perPage }
    const data = await this.request<{
      Page: {
        pageInfo: { hasNextPage: boolean; total: number }
        media: Media[]
      }
    }>(query, variables)

    return {
      media: data.Page.media,
      pageInfo: data.Page.pageInfo,
    }
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