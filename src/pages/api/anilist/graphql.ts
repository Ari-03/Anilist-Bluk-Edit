import { NextApiRequest, NextApiResponse } from 'next'

const ANILIST_URL = process.env.ANILIST_API_URL || 'https://graphql.anilist.co'

// Forwarded verbatim so the browser-side pacer can read AniList's budget.
// (These are per-IP on AniList's side, so this is the only place they exist.)
const RATE_HEADERS = ['retry-after', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset'] as const

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * Transparent GraphQL proxy: same status code, same rate-limit headers, and a
 * GraphQL-shaped body even when AniList (or Cloudflare in front of it) answers
 * with an HTML error page. The token never leaves the server in a URL.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { query, variables, token } = req.body

  if (!query) {
    return res.status(400).json({ error: 'GraphQL query is required' })
  }

  if (!token) {
    return res.status(400).json({ error: 'Access token is required' })
  }

  try {
    const upstream = await fetch(ANILIST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables: variables || {} }),
    })

    for (const name of RATE_HEADERS) {
      const value = upstream.headers.get(name)
      if (value) res.setHeader(name, value)
    }

    const text = await upstream.text()
    const body = parseJson(text) ?? {
      data: null,
      errors: [{
        message: `AniList returned ${upstream.status} ${upstream.statusText}`.trim(),
        status: upstream.status,
      }],
    }

    if (!upstream.ok) {
      console.error(`AniList ${upstream.status}:`, text.slice(0, 300))
    }

    return res.status(upstream.status).json(body)
  } catch (error) {
    console.error('AniList proxy error:', error)
    return res.status(502).json({
      data: null,
      errors: [{ message: error instanceof Error ? error.message : 'Could not reach AniList', status: 502 }],
    })
  }
}
