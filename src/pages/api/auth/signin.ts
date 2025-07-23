import { NextApiRequest, NextApiResponse } from 'next'
import { serialize } from 'cookie'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { token } = req.body

  if (!token) {
    return res.status(400).json({ error: 'Token is required' })
  }

  try {
    // Log the token for debugging (first few characters only)
    console.log('Validating token:', token.substring(0, 10) + '...')
    
    // Retry logic with exponential backoff
    const maxRetries = 3
    let retryCount = 0
    let response: Response | undefined
    
    while (retryCount <= maxRetries) {
      try {
        console.log(`Attempt ${retryCount + 1}/${maxRetries + 1} - Validating token with AniList API`)
        
        // Create AbortController for timeout
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout
        
        // Validate the token by making a request to AniList API
        response = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            query: `
              query {
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
            `,
          }),
          signal: controller.signal
        })
        
        clearTimeout(timeoutId)
        break // Success, exit retry loop
        
      } catch (error) {
        retryCount++
        console.error(`Attempt ${retryCount}/${maxRetries + 1} failed:`, error)
        
        if (retryCount > maxRetries) {
          // All retries exhausted
          if (error instanceof Error && error.name === 'AbortError') {
            return res.status(408).json({ 
              error: 'Request timeout - AniList API is not responding. Please try again later.',
              details: 'Connection timed out after 30 seconds'
            })
          }
          
          return res.status(503).json({ 
            error: 'Unable to connect to AniList API. Please check your internet connection and try again.',
            details: error instanceof Error ? error.message : 'Network error'
          })
        }
        
        // Exponential backoff: wait 1s, 2s, 4s between retries
        const delay = Math.pow(2, retryCount - 1) * 1000
        console.log(`Waiting ${delay}ms before retry...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    // Ensure response was successfully obtained
    if (!response) {
      return res.status(500).json({ 
        error: 'Failed to get response from AniList API after all retries',
        details: 'All connection attempts failed'
      })
    }

    console.log('AniList API response status:', response.status, response.statusText)
    console.log('AniList API response headers:', Object.fromEntries(response.headers.entries()))

    // Check if response is successful
    if (!response.ok) {
      const responseText = await response.text()
      console.error('AniList API error response:', responseText)
      
      // Handle rate limiting specifically
      if (response.status === 429) {
        return res.status(429).json({ 
          error: 'Rate limit exceeded. Please wait a minute before trying again.',
          details: 'AniList API rate limit reached'
        })
      }
      
      return res.status(401).json({ 
        error: `AniList API returned ${response.status}: ${response.statusText}`,
        details: responseText.substring(0, 500) // Limit error text
      })
    }

    // Check if response is JSON
    const contentType = response.headers.get('content-type')
    if (!contentType || !contentType.includes('application/json')) {
      const responseText = await response.text()
      console.error('AniList API returned non-JSON response:', responseText.substring(0, 500))
      return res.status(500).json({ 
        error: 'AniList API returned non-JSON response',
        contentType: contentType,
        details: responseText.substring(0, 500)
      })
    }

    const data = await response.json()
    console.log('AniList API response data:', data.data ? 'Success' : 'No data', data.errors ? 'Has errors' : 'No errors')

    if (data.errors) {
      console.error('AniList GraphQL errors:', data.errors)
      return res.status(401).json({ error: 'Invalid token or AniList API error', details: data.errors })
    }

    if (!data.data?.Viewer) {
      console.error('No Viewer data in response:', data)
      return res.status(401).json({ error: 'Invalid token - unable to get user data' })
    }

    const user = data.data.Viewer

    // Create session data (AniList tokens are valid for 1 year)
    const expiresAt = new Date()
    expiresAt.setFullYear(expiresAt.getFullYear() + 1)

    const sessionData = {
      user: {
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        bannerImage: user.bannerImage,
        about: user.about,
        options: user.options,
        mediaListOptions: user.mediaListOptions,
        statistics: user.statistics,
      },
      accessToken: token,
      expiresAt: expiresAt.toISOString()
    }

    // Create secure session cookie (in production, this should be encrypted/signed)
    const sessionToken = Buffer.from(JSON.stringify(sessionData)).toString('base64')
    
    res.setHeader('Set-Cookie', serialize('anilist_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 365 * 24 * 60 * 60 // 1 year
    }))

    return res.status(200).json({
      success: true,
      user: sessionData.user,
      accessToken: token,
      expiresAt: sessionData.expiresAt
    })
  } catch (error) {
    console.error('Token validation error:', error)
    return res.status(500).json({ error: 'Internal server error validating token' })
  }
}