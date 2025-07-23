import { NextApiRequest, NextApiResponse } from 'next'
import { serialize, parse } from 'cookie'

interface SessionData {
  user: any
  accessToken: string
  expiresAt: string
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const cookies = parse(req.headers.cookie || '')
    const sessionToken = cookies.anilist_session

    if (!sessionToken) {
      return res.status(401).json({ error: 'No session found' })
    }

    // Decode the session data (in production, this should be encrypted/signed)
    let sessionData: SessionData
    try {
      sessionData = JSON.parse(Buffer.from(sessionToken, 'base64').toString('utf-8'))
    } catch (error) {
      // Invalid session data
      return res.status(401).json({ error: 'Invalid session' })
    }

    // Check if session has expired
    if (sessionData.expiresAt && new Date(sessionData.expiresAt) < new Date()) {
      // Clear expired session
      res.setHeader('Set-Cookie', serialize('anilist_session', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        expires: new Date(0)
      }))
      return res.status(401).json({ error: 'Session expired' })
    }

    // Validate token is still valid with AniList
    try {
      console.log('Validating session token:', sessionData.accessToken.substring(0, 10) + '...')
      
      // Create AbortController for timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000) // 15 second timeout for session validation
      
      const response = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${sessionData.accessToken}`,
        },
        body: JSON.stringify({
          query: '{ Viewer { id name } }'
        }),
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)

      console.log('Session validation response status:', response.status, response.statusText)

      // Check if response is successful
      if (!response.ok) {
        const responseText = await response.text()
        console.error('AniList API error in session validation:', responseText)
        
        // Clear invalid session
        res.setHeader('Set-Cookie', serialize('anilist_session', '', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          path: '/',
          expires: new Date(0)
        }))
        return res.status(401).json({ 
          error: `Session validation failed: ${response.status} ${response.statusText}`,
          details: responseText.substring(0, 500)
        })
      }

      // Check if response is JSON
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        const responseText = await response.text()
        console.error('Session validation returned non-JSON:', responseText.substring(0, 500))
        
        // Clear invalid session
        res.setHeader('Set-Cookie', serialize('anilist_session', '', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          path: '/',
          expires: new Date(0)
        }))
        return res.status(500).json({ 
          error: 'Session validation returned non-JSON response',
          contentType: contentType
        })
      }

      const data = await response.json()
      console.log('Session validation result:', data.data ? 'Success' : 'No data', data.errors ? 'Has errors' : 'No errors')

      if (data.errors || !data.data?.Viewer) {
        console.error('Session validation GraphQL errors:', data.errors)
        
        // Token is invalid, clear session
        res.setHeader('Set-Cookie', serialize('anilist_session', '', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          path: '/',
          expires: new Date(0)
        }))
        return res.status(401).json({ error: 'Invalid token', details: data.errors })
      }
    } catch (error) {
      console.error('Session validation fetch error:', error)
      
      // Handle timeout errors specifically
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('Session validation timed out')
        return res.status(408).json({ 
          error: 'Session validation timed out', 
          details: 'AniList API is not responding. Please try refreshing the page.'
        })
      }
      
      return res.status(500).json({ 
        error: 'Failed to validate session', 
        details: error instanceof Error ? error.message : 'Unknown error'
      })
    }

    return res.status(200).json({
      user: sessionData.user,
      accessToken: sessionData.accessToken,
      expiresAt: sessionData.expiresAt
    })
  } catch (error) {
    console.error('Session validation error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}