import { NextApiRequest, NextApiResponse } from 'next'
import { serialize } from 'cookie'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Clear the session cookie
    res.setHeader('Set-Cookie', serialize('anilist_session', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      expires: new Date(0) // Expire immediately
    }))

    return res.status(200).json({ success: true })
  } catch (error) {
    console.error('Sign out error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}