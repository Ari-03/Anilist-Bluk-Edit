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
    // Validate the token by making a request to AniList API
    const response = await fetch('https://graphql.anilist.co', {
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
    })

    const data = await response.json()

    if (data.errors) {
      return res.status(401).json({ error: 'Invalid token or AniList API error', details: data.errors })
    }

    if (!data.data?.Viewer) {
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