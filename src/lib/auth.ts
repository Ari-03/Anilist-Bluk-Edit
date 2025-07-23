import { NextApiRequest, NextApiResponse } from 'next'
import { parse } from 'cookie'

interface SessionData {
  user: any
  accessToken: string
  expiresAt: string
}

export interface AuthenticatedRequest extends NextApiRequest {
  user?: any
  accessToken?: string
}

/**
 * Middleware to validate authentication for API routes
 */
export function withAuth(handler: (req: AuthenticatedRequest, res: NextApiResponse) => Promise<void>) {
  return async (req: AuthenticatedRequest, res: NextApiResponse) => {
    try {
      const cookies = parse(req.headers.cookie || '')
      const sessionToken = cookies.anilist_session

      if (!sessionToken) {
        return res.status(401).json({ error: 'Authentication required' })
      }

      // Decode session data
      let sessionData: SessionData
      try {
        sessionData = JSON.parse(Buffer.from(sessionToken, 'base64').toString('utf-8'))
      } catch (error) {
        return res.status(401).json({ error: 'Invalid session' })
      }

      // Check if session has expired
      if (sessionData.expiresAt && new Date(sessionData.expiresAt) < new Date()) {
        return res.status(401).json({ error: 'Session expired' })
      }

      // Attach user and token to request
      req.user = sessionData.user
      req.accessToken = sessionData.accessToken

      return handler(req, res)
    } catch (error) {
      console.error('Auth middleware error:', error)
      return res.status(500).json({ error: 'Internal server error' })
    }
  }
}

/**
 * Validate AniList token with the API
 */
export async function validateAniListToken(token: string): Promise<{ valid: boolean; user?: any; error?: string }> {
  try {
    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: '{ Viewer { id name avatar { medium } } }'
      }),
    })

    const data = await response.json()

    if (data.errors || !data.data?.Viewer) {
      return { valid: false, error: 'Invalid token' }
    }

    return { valid: true, user: data.data.Viewer }
  } catch (error) {
    return { valid: false, error: 'Failed to validate token' }
  }
}

/**
 * Client-side utility to check if user is authenticated
 */
export function useRequireAuth() {
  const checkAuth = async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/session', {
        credentials: 'include'
      })
      return response.ok
    } catch {
      return false
    }
  }

  return { checkAuth }
}

/**
 * Get remaining time until token expiration
 */
export function getTokenTimeRemaining(expiresAt: string | Date): {
  expired: boolean
  days: number
  hours: number
  minutes: number
  warningLevel: 'none' | 'warning' | 'critical' | 'expired'
} {
  const now = new Date()
  const expiry = new Date(expiresAt)
  const timeDiff = expiry.getTime() - now.getTime()

  if (timeDiff <= 0) {
    return {
      expired: true,
      days: 0,
      hours: 0,
      minutes: 0,
      warningLevel: 'expired'
    }
  }

  const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60))

  let warningLevel: 'none' | 'warning' | 'critical' | 'expired' = 'none'
  if (days <= 1) {
    warningLevel = 'critical'
  } else if (days <= 7) {
    warningLevel = 'warning'
  }

  return {
    expired: false,
    days,
    hours,
    minutes,
    warningLevel
  }
}