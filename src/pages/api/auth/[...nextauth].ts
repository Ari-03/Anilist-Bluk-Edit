import NextAuth, { NextAuthOptions } from 'next-auth'
import { JWT } from 'next-auth/jwt'

declare module 'next-auth' {
    interface Session {
        accessToken?: string
        anilistData?: any
        user: {
            id: string
            name: string
            email?: string
            image?: string
        }
    }
}

declare module 'next-auth/jwt' {
    interface JWT {
        accessToken?: string
        refreshToken?: string
        accessTokenExpires?: number
        anilistData?: any
    }
}

const ANILIST_AUTHORIZATION_URL = 'https://anilist.co/api/v2/oauth/authorize'
const ANILIST_TOKEN_URL = 'https://anilist.co/api/v2/oauth/token'

export const authOptions: NextAuthOptions = {
    providers: [
        {
            id: 'anilist',
            name: 'AniList',
            type: 'oauth',
            authorization: {
                url: ANILIST_AUTHORIZATION_URL,
                params: {
                    response_type: 'code',
                    scope: '',
                },
            },
            token: ANILIST_TOKEN_URL,
            userinfo: {
                url: 'https://graphql.anilist.co',
                async request({ tokens }) {
                    if (!tokens.access_token) {
                        throw new Error('No access token available')
                    }

                    const response = await fetch('https://graphql.anilist.co', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            'Authorization': `Bearer ${tokens.access_token}`,
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
                  }
                }
              `,
                        }),
                    })

                    const data = await response.json()

                    if (data.errors) {
                        throw new Error(`AniList API Error: ${data.errors[0].message}`)
                    }

                    const user = data.data.Viewer
                    return {
                        id: user.id.toString(),
                        name: user.name,
                        email: `${user.name}@anilist.user`, // AniList doesn't provide email
                        image: user.avatar?.large || user.avatar?.medium,
                        anilistData: user,
                    }
                },
            },
            clientId: process.env.ANILIST_CLIENT_ID,
            clientSecret: process.env.ANILIST_CLIENT_SECRET,
            profile(profile) {
                return {
                    id: profile.id,
                    name: profile.name,
                    email: profile.email,
                    image: profile.image,
                    anilistData: profile.anilistData,
                }
            },
        },
    ],
    callbacks: {
        async jwt({ token, account, profile }) {
            // Initial sign in
            if (account && profile) {
                token.accessToken = account.access_token
                token.refreshToken = account.refresh_token
                token.accessTokenExpires = account.expires_at ? account.expires_at * 1000 : 0
                token.anilistData = (profile as any).anilistData
            }

            // Return previous token if the access token has not expired yet
            if (Date.now() < (token.accessTokenExpires || 0)) {
                return token
            }

            // Access token has expired, but AniList doesn't support refresh tokens
            // User will need to re-authenticate
            return token
        },
        async session({ session, token }) {
            session.accessToken = token.accessToken
            session.user.id = token.sub || ''
            session.anilistData = token.anilistData
            return session
        },
    },
    pages: {
        signIn: '/auth/signin',
        error: '/auth/error',
    },
    session: {
        strategy: 'jwt',
        maxAge: 30 * 24 * 60 * 60, // 30 days
    },
    secret: process.env.NEXTAUTH_SECRET,
}

export default NextAuth(authOptions) 