import { NextApiRequest, NextApiResponse } from 'next'

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
    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        query,
        variables: variables || {}
      }),
    })

    const data = await response.json()

    // Handle rate limiting and other HTTP errors properly
    if (!response.ok) {
      // Return the full error response with proper status code
      return res.status(response.status).json({
        error: 'AniList API error',
        status: response.status,
        statusText: response.statusText,
        data: data,
        details: data?.errors || []
      })
    }

    // Log large responses for debugging
    const responseSize = JSON.stringify(data).length
    if (responseSize > 1024 * 1024) { // > 1MB
      console.warn(`Large API response: ${(responseSize / 1024 / 1024).toFixed(2)}MB`)
    }

    // Forward successful responses
    return res.status(200).json(data)

  } catch (error) {
    console.error('AniList proxy error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}