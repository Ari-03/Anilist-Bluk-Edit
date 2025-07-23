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
      })

      const data = await response.json()

      if (data.errors || !data.data?.Viewer) {
        // Token is invalid, clear session
        res.setHeader('Set-Cookie', serialize('anilist_session', '', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          path: '/',
          expires: new Date(0)
        }))
        return res.status(401).json({ error: 'Invalid token' })
      }
    } catch (error) {
      return res.status(500).json({ error: 'Failed to validate session' })
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