import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { User } from '@/types/anilist'

interface AuthContextType {
  user: User | null
  accessToken: string | null
  isLoading: boolean
  isAuthenticated: boolean
  tokenExpiresAt: Date | null
  signIn: (token: string) => Promise<{ success: boolean; error?: string }>
  signInWithToken: (token: string) => Promise<{ success: boolean; error?: string }>
  signInWithOAuth: (clientId?: string) => void
  signOut: () => void
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [tokenExpiresAt, setTokenExpiresAt] = useState<Date | null>(null)

  // Load stored auth data on mount and check session
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // First try to restore session from secure cookies
        const response = await fetch('/api/auth/session', {
          credentials: 'include'
        })
        
        if (response.ok) {
          const data = await response.json()
          if (data.user && data.accessToken) {
            setUser(data.user)
            setAccessToken(data.accessToken)
            setTokenExpiresAt(data.expiresAt ? new Date(data.expiresAt) : null)
            setIsLoading(false)
            return
          }
        }
        
        // Fallback to localStorage for backward compatibility
        const storedToken = localStorage.getItem('anilist_access_token')
        const storedUser = localStorage.getItem('anilist_user_data')
        
        if (storedToken && storedUser) {
          try {
            const userData = JSON.parse(storedUser)
            // Migrate to secure storage
            await signInWithToken(storedToken)
            // Clear old localStorage data
            localStorage.removeItem('anilist_access_token')
            localStorage.removeItem('anilist_user_data')
          } catch (error) {
            console.error('Error migrating stored auth data:', error)
            // Clear invalid data
            localStorage.removeItem('anilist_access_token')
            localStorage.removeItem('anilist_user_data')
          }
        }
      } catch (error) {
        console.error('Error initializing auth:', error)
      } finally {
        setIsLoading(false)
      }
    }

    initializeAuth()
  }, [])

  // Legacy method for backward compatibility
  const signIn = async (token: string): Promise<{ success: boolean; error?: string }> => {
    return signInWithToken(token)
  }

  // Secure token authentication with cookie storage
  const signInWithToken = async (token: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true)
    
    try {
      const response = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ token }),
      })

      const data = await response.json()

      if (!response.ok) {
        setIsLoading(false)
        return { success: false, error: data.error || 'Authentication failed' }
      }

      // Update state with secure session data
      setAccessToken(data.accessToken)
      setUser(data.user)
      setTokenExpiresAt(data.expiresAt ? new Date(data.expiresAt) : null)
      setIsLoading(false)
      
      return { success: true }
    } catch (error) {
      console.error('Sign in error:', error)
      setIsLoading(false)
      return { success: false, error: 'Network error or server is unavailable' }
    }
  }

  // OAuth flow initiation
  const signInWithOAuth = (clientId?: string) => {
    const actualClientId = clientId || process.env.NEXT_PUBLIC_ANILIST_CLIENT_ID
    
    if (!actualClientId) {
      console.error('No AniList client ID provided or configured')
      return
    }

    // Build the authorization URL with only required parameters
    // Note: redirect_uri is not needed for AniList implicit flow - it uses the one configured in your app settings
    const params = new URLSearchParams({
      client_id: actualClientId,
      response_type: 'token'
    })
    
    const authUrl = `https://anilist.co/api/v2/oauth/authorize?${params.toString()}`
    
    console.log('OAuth URL:', authUrl)
    console.log('Expected redirect to your configured redirect URI in AniList app settings')
    
    window.location.href = authUrl
  }

  // Refresh session data
  const refreshSession = async (): Promise<void> => {
    try {
      const response = await fetch('/api/auth/session', {
        credentials: 'include'
      })
      
      if (response.ok) {
        const data = await response.json()
        if (data.user && data.accessToken) {
          setUser(data.user)
          setAccessToken(data.accessToken)
          setTokenExpiresAt(data.expiresAt ? new Date(data.expiresAt) : null)
        }
      } else {
        // Session invalid, clear state
        setUser(null)
        setAccessToken(null)
        setTokenExpiresAt(null)
      }
    } catch (error) {
      console.error('Error refreshing session:', error)
    }
  }

  const signOut = async () => {
    try {
      // Clear server-side session
      await fetch('/api/auth/signout', {
        method: 'POST',
        credentials: 'include'
      })
    } catch (error) {
      console.error('Error signing out:', error)
    } finally {
      // Clear client-side state
      setAccessToken(null)
      setUser(null)
      setTokenExpiresAt(null)
      
      // Clear any remaining localStorage data
      localStorage.removeItem('anilist_access_token')
      localStorage.removeItem('anilist_user_data')
    }
  }

  const value: AuthContextType = {
    user,
    accessToken,
    isLoading,
    isAuthenticated: !!user && !!accessToken,
    tokenExpiresAt,
    signIn,
    signInWithToken,
    signInWithOAuth,
    signOut,
    refreshSession,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}