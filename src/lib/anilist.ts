import {
  User,
  MediaList,
  MediaListStatus,
  MediaType,
  MediaListOptions,
  Media,
  ScoreFormat,
} from '@/types/anilist'

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
    const query = `
      query GetCurrentUser {
        Viewer {
          id
          name
          avatar {
            large
            medium
          }
          bannerImage
          about
          options {
            titleLanguage
            displayAdultContent
            airingNotifications
            profileColor
          }
          mediaListOptions {
            scoreFormat
            rowOrder
            animeList {
              sectionOrder
              splitCompletedSectionByFormat
              customLists
              advancedScoring
              advancedScoringEnabled
            }
            mangaList {
              sectionOrder
              splitCompletedSectionByFormat
              customLists
              advancedScoring
              advancedScoringEnabled
            }
          }
          statistics {
            anime {
              count
              meanScore
              minutesWatched
              episodesWatched
            }
            manga {
              count
              meanScore
              chaptersRead
              volumesRead
            }
          }
        }
      }
    `

    const data = await this.request<{ Viewer: User }>(query)
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
    id: number,
    mediaId: number, // Add mediaId here
    updates: Partial<{
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
              romaji
              english
              native
              userPreferred
            }
            type
            format
            episodes
            chapters
            volumes
            coverImage {
              large
              medium
            }
          }
        }
      }
    `

    const variables = { id, mediaId, ...updates } // Add mediaId to variables
    const data = await this.request<{
      SaveMediaListEntry: MediaList
    }>(mutation, variables)

    return data.SaveMediaListEntry
  }

  async bulkUpdateMediaListEntries(
    updates: Array<{
      id: number
      mediaId: number
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
    }>
  ): Promise<MediaList[]> {
    // AniList doesn't have a bulk update mutation, so we'll do individual updates
    // We'll batch them in groups to avoid rate limiting
    const results: MediaList[] = []
    const batchSize = 5 // Conservative batch size to avoid rate limits

    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize)
      const batchPromises = batch.map(({ id, mediaId, ...update }) =>
        this.updateMediaListEntry(id, mediaId, update)
      )

      try {
        const batchResults = await Promise.all(batchPromises)
        results.push(...batchResults)
      } catch (error) {
        // If a batch fails, try individual updates
        console.warn(`Batch ${i / batchSize + 1} failed, trying individual updates:`, error)
        for (const { id, mediaId, ...update } of batch) {
          try {
            const result = await this.updateMediaListEntry(id, mediaId, update)
            results.push(result)
          } catch (individualError) {
            console.error(`Failed to update media with entry id ${id}:`, individualError)
          }
        }
      }

      // Add a small delay between batches to be respectful to the API
      if (i + batchSize < updates.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    return results
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
      return 'bg-green-500'
    case MediaListStatus.PLANNING:
      return 'bg-blue-500'
    case MediaListStatus.COMPLETED:
      return 'bg-purple-500'
    case MediaListStatus.DROPPED:
      return 'bg-red-500'
    case MediaListStatus.PAUSED:
      return 'bg-orange-500'
    case MediaListStatus.REPEATING:
      return 'bg-indigo-500'
    default:
      return 'bg-gray-500'
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