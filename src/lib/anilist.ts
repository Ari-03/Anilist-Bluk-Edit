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

  private buildBatchedMutation(
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
  ): { mutation: string; variables: Record<string, any> } {
    const mutations: string[] = []
    const variables: Record<string, any> = {}

    updates.forEach((update, index) => {
      const alias = `update${index}`
      const variablePrefix = `${alias}_`

      // Build the mutation for this entry
      const mutationArgs: string[] = []
      const mutationFields: string[] = []

      // Add id and mediaId
      mutationArgs.push(`id: $${variablePrefix}id`)
      mutationArgs.push(`mediaId: $${variablePrefix}mediaId`)
      variables[`${variablePrefix}id`] = update.id
      variables[`${variablePrefix}mediaId`] = update.mediaId

      // Add other fields dynamically
      Object.entries(update).forEach(([key, value]) => {
        if (key !== 'id' && key !== 'mediaId' && value !== undefined) {
          mutationArgs.push(`${key}: $${variablePrefix}${key}`)
          variables[`${variablePrefix}${key}`] = value
        }
      })

      // Build the mutation string
      mutations.push(`
        ${alias}: SaveMediaListEntry(${mutationArgs.join(', ')}) {
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
      `)
    })

    // Build variable definitions for the query
    const variableDefinitions: string[] = []
    Object.keys(variables).forEach(varName => {
      const value = variables[varName]
      let type = 'String'
      
      if (varName.endsWith('_id') || varName.endsWith('_mediaId')) {
        type = 'Int'
      } else if (varName.endsWith('_score')) {
        type = 'Float'
      } else if (varName.endsWith('_progress') || varName.endsWith('_progressVolumes') || varName.endsWith('_repeat') || varName.endsWith('_priority')) {
        type = 'Int'
      } else if (varName.endsWith('_private') || varName.endsWith('_hiddenFromStatusLists')) {
        type = 'Boolean'
      } else if (varName.endsWith('_status')) {
        type = 'MediaListStatus'
      } else if (varName.endsWith('_customLists')) {
        type = '[String]'
      } else if (varName.endsWith('_advancedScores')) {
        type = '[Float]'
      } else if (varName.endsWith('_startedAt') || varName.endsWith('_completedAt')) {
        type = 'FuzzyDateInput'
      }
      
      variableDefinitions.push(`$${varName}: ${type}`)
    })

    const mutation = `
      mutation BatchUpdateMediaListEntries(${variableDefinitions.join(', ')}) {
        ${mutations.join('\n')}
      }
    `

    return { mutation, variables }
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
    }>,
    progressCallback?: (progress: {
      processed: number
      total: number
      successful: number
      failed: number
      rateLimited: number
      currentBatch: number
    }) => void,
    rateLimiterRef?: { current: any } // Reference to rate limiter for stats tracking
  ): Promise<MediaList[]> {
    const results: MediaList[] = []
    const batchSize = 10 // Conservative batch size for better rate limit compliance and progress tracking
    const totalEntries = updates.length
    let processedCount = 0
    let successfulCount = 0
    let failedCount = 0
    let rateLimitedCount = 0

    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize)
      let batchSuccess = false
      const maxRetries = 5
      const retryDelays = [4000, 8000, 15000, 30000, 60000] // 4s, 8s, 15s, 30s, 60s
      
      // Retry loop with custom delay sequence for rate limit errors
      for (let retryCount = 0; retryCount <= maxRetries && !batchSuccess; retryCount++) {
        try {
          // Use GraphQL batching for this batch
          const { mutation, variables } = this.buildBatchedMutation(batch)
          const data = await this.request<Record<string, MediaList>>(mutation, variables)
          
          // Extract results from the batched response and handle partial failures
          const batchResults: (MediaList | null)[] = []
          batch.forEach((_, index) => {
            const alias = `update${index}`
            const result = data[alias]
            if (result) {
              batchResults.push(result)
            } else {
              console.warn(`Batch update failed for entry at index ${index}`)
              batchResults.push(null)
            }
          })
          
          const successfulResults = batchResults.filter((result): result is MediaList => result !== null)
          results.push(...successfulResults)
          
          // Update batch stats
          successfulCount += successfulResults.length
          failedCount += (batch.length - successfulResults.length)
          processedCount += batch.length
          
          batchSuccess = true
          
        } catch (error: any) {
          // Check if this is a rate limit error and we have retries left
          if (this.isRateLimitError(error) && retryCount < maxRetries) {
            rateLimitedCount += batch.length // Track rate limited entries
            
            // Update rate limiter stats if available
            if (rateLimiterRef?.current) {
              rateLimiterRef.current.stats.rateLimitHits++
              rateLimiterRef.current.stats.retriedRequests++
            }
            
            const delay = retryDelays[retryCount]
            console.warn(`Rate limit hit on batch ${i / batchSize + 1}, waiting ${delay}ms before retry (attempt ${retryCount + 1}/${maxRetries + 1})`)
            await this.delay(delay)
            continue // Retry the batch
          }
          
          // If not a rate limit error or no retries left, fall back to individual updates
          console.warn(`GraphQL batch ${i / batchSize + 1} failed after ${retryCount} retries, falling back to individual updates:`, error)
          
          // Check if this is a GraphQL error with partial results
          if (error.graphQLErrors) {
            console.warn('GraphQL errors in batch:', error.graphQLErrors)
          }
          
          // Fallback to individual updates if batch fails completely
          let batchSuccessful = 0
          let batchFailed = 0
          
          for (const { id, mediaId, ...update } of batch) {
            try {
              const result = await this.updateMediaListEntry(id, mediaId, update)
              results.push(result)
              batchSuccessful++
              
              // Add small delay between individual fallback requests
              await new Promise((resolve) => setTimeout(resolve, 100))
            } catch (individualError) {
              console.error(`Failed to update media with entry id ${id}:`, individualError)
              batchFailed++
            }
          }
          
          // Update stats for fallback processing
          successfulCount += batchSuccessful
          failedCount += batchFailed
          processedCount += batch.length
          
          batchSuccess = true // Mark as "handled" to exit retry loop
        }
      }
      
      // Call progress callback after each batch
      if (progressCallback) {
        progressCallback({
          processed: processedCount,
          total: totalEntries,
          successful: successfulCount,
          failed: failedCount,
          rateLimited: rateLimitedCount,
          currentBatch: Math.floor(i / batchSize) + 1
        })
      }

      // Small delay between batches to respect rate limits
      if (i + batchSize < updates.length) {
        await new Promise((resolve) => setTimeout(resolve, 500)) // Reduced delay since batches are more efficient
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