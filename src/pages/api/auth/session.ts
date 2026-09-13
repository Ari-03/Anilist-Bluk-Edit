import { NextApiRequest, NextApiResponse } from 'next'
import { serialize, parse } from 'cookie'
import { VIEWER_QUERY, pickSessionUser } from '@/lib/viewerQuery'

interface SessionData {
  user: any
  accessToken: string
  expiresAt: string
}

const COOKIE = 'anilist_session'

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
}

const encode = (session: SessionData) => Buffer.from(JSON.stringify(session)).toString('base64')

/**
 * Restores the session cookie and re-validates it against AniList.
 *
 * Only a definitive auth failure (HTTP 401, or a GraphQL "Invalid token")
 * clears the cookie. Rate limits, outages, timeouts and HTML error pages fall
 * back to the cached session with `stale: true` — a transient API problem must
 * never log the user out.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const cookies = parse(req.headers.cookie || '')
  const sessionToken = cookies[COOKIE]

  if (!sessionToken) {
    return res.status(401).json({ error: 'No session found' })
  }

  let session: SessionData
  try {
    session = JSON.parse(Buffer.from(sessionToken, 'base64').toString('utf-8'))
  } catch {
    return res.status(401).json({ error: 'Invalid session' })
  }

  const clearAndReject = (error: string, details?: unknown) => {
    res.setHeader('Set-Cookie', serialize(COOKIE, '', { ...cookieOptions, expires: new Date(0) }))
    return res.status(401).json({ error, details })
  }

  const respondStale = () => res.status(200).json({ ...session, stale: true })

  if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
    return clearAndReject('Session expired')
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${session.accessToken}`,
      },
      // Full viewer query: the response refreshes the cached user (incl.
      // custom list names created after the original sign-in)
      body: JSON.stringify({ query: VIEWER_QUERY }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    const text = await response.text()
    let data: any = null
    try {
      data = JSON.parse(text)
    } catch {
      // HTML error page from Cloudflare/nginx (seen on 429s) — not an auth verdict
    }

    if (response.status === 401) {
      return clearAndReject('Invalid token')
    }

    const errors: Array<{ message?: string; status?: number }> = data?.errors ?? []
    const tokenRejected = errors.some(e => e.status === 401 || /invalid token/i.test(e.message ?? ''))
    if (tokenRejected) {
      console.error('Session validation: token rejected', errors)
      return clearAndReject('Invalid token', errors)
    }

    if (!response.ok || !data?.data?.Viewer) {
      console.warn(`Session validation degraded (${response.status}), serving cached session:`, text.slice(0, 200))
      return respondStale()
    }

    // Re-mint the session with the fresh viewer so profile changes made on
    // anilist.co (new custom lists, score format, avatar) propagate on load
    const refreshed: SessionData = {
      user: pickSessionUser(data.data.Viewer),
      accessToken: session.accessToken,
      expiresAt: session.expiresAt,
    }
    res.setHeader('Set-Cookie', serialize(COOKIE, encode(refreshed), { ...cookieOptions, maxAge: 365 * 24 * 60 * 60 }))
    return res.status(200).json(refreshed)
  } catch (error) {
    // Timeout or network failure: stale data beats logging the user out
    console.error('Session validation fetch error:', error)
    return respondStale()
  }
}
