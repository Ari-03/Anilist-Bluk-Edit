import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'
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
  
  // Track in-flight requests to prevent duplicates
  const activeRequests = useRef(new Set<string>())
  const initializationComplete = useRef(false)

  // Load stored auth data on mount and check session
  useEffect(() => {
    // Prevent multiple initializations (React Strict Mode protection)
    if (initializationComplete.current) {
      return
    }

    let isMounted = true // Strict Mode cleanup protection

    const initializeAuth = async () => {
      try {
        console.log('Initializing auth...', { 
          hasUser: !!user, 
          hasToken: !!accessToken,
          initComplete: initializationComplete.current 
        })
        initializationComplete.current = true

        // Check if we recently validated to avoid rate limiting (only if we have existing auth data)
        const lastValidation = sessionStorage.getItem('last_token_validation')
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000)
        
        // Only skip validation if we have recent validation AND existing auth state
        if (lastValidation && parseInt(lastValidation) > fiveMinutesAgo && user && accessToken) {
          console.log('Skipping validation - already authenticated and checked recently', {
            lastValidation: new Date(parseInt(lastValidation)).toISOString(),
            user: user?.name,
            tokenLength: accessToken?.length
          })
          if (isMounted) setIsLoading(false)
          return
        }
        
        console.log('Proceeding with authentication check...', {
          hasLastValidation: !!lastValidation,
          isRecent: lastValidation && parseInt(lastValidation) > fiveMinutesAgo,
          hasAuth: !!(user && accessToken)
        })

        // First try to restore session from secure cookies
        const response = await fetch('/api/auth/session', {
          credentials: 'include'
        })
        
        if (response.ok) {
          const data = await response.json()
          if (data.user && data.accessToken && isMounted) {
            setUser(data.user)
            setAccessToken(data.accessToken)
            setTokenExpiresAt(data.expiresAt ? new Date(data.expiresAt) : null)
            sessionStorage.setItem('last_token_validation', Date.now().toString())
            setIsLoading(false)
            return
          }
        } else if (response.status === 429) {
          console.log('Rate limited during initialization, will retry later')
          if (isMounted) setIsLoading(false)
          return
        } else if (response.status === 408) {
          console.log('Session validation timed out during initialization')
          if (isMounted) setIsLoading(false)
          return
        } else if (response.status === 503) {
          console.log('Network issues during initialization - falling back to cached data')
          if (isMounted) setIsLoading(false)
          return
        }
        
        // Fallback to localStorage for backward compatibility
        const storedToken = localStorage.getItem('anilist_access_token')
        const storedUser = localStorage.getItem('anilist_user_data')
        
        if (storedToken && storedUser && isMounted) {
          try {
            const userData = JSON.parse(storedUser)
            // Set data without API validation to avoid loops
            setUser(userData)
            setAccessToken(storedToken)
            console.log('Loaded cached auth data from localStorage')
            // Don't call signInWithToken here to avoid infinite loop
          } catch (error) {
            console.error('Error parsing stored auth data:', error)
            // Clear invalid data
            localStorage.removeItem('anilist_access_token')
            localStorage.removeItem('anilist_user_data')
          }
        }
      } catch (error) {
        console.error('Error initializing auth:', error)
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    initializeAuth()

    // Cleanup function for React Strict Mode
    return () => {
      isMounted = false
      // Reset initialization flag on unmount - will be set again if component remounts
      initializationComplete.current = false
      // Clear any pending active requests on component unmount
      const currentRequests = activeRequests.current
      currentRequests.clear()
      console.log('AuthContext unmounted - cleared active requests')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, accessToken]) 

  // Legacy method for backward compatibility
  const signIn = async (token: string): Promise<{ success: boolean; error?: string }> => {
    return signInWithToken(token)
  }

  // Secure token authentication with cookie storage
  const signInWithToken = useCallback(async (token: string): Promise<{ success: boolean; error?: string }> => {
    // Create more specific request key that includes timestamp to avoid long-term blocking
    const requestKey = `signin_${token.substring(0, 10)}_${Date.now()}`
    const generalKey = `signin_${token.substring(0, 10)}`
    
    // Check for recent requests (within last 5 seconds) to prevent spam
    const recentRequests = Array.from(activeRequests.current).filter(key => 
      key.startsWith(`signin_${token.substring(0, 10)}_`) && 
      Date.now() - parseInt(key.split('_')[2]) < 5000
    )
    
    if (recentRequests.length > 0) {
      console.log('Preventing duplicate signin request - recent attempt exists', { 
        recentRequests: recentRequests.length,
        token: token.substring(0, 10)
      })
      return { success: false, error: 'Please wait a moment before trying again' }
    }

    console.log('Starting sign in with token...', { 
      tokenPrefix: token.substring(0, 10),
      activeRequests: activeRequests.current.size,
      requestKey
    })
    
    activeRequests.current.add(requestKey)
    setIsLoading(true)
    
    // Set up automatic cleanup after 10 seconds
    const cleanupTimeout = setTimeout(() => {
      activeRequests.current.delete(requestKey)
      console.log('Cleaned up stale request:', requestKey)
    }, 10000)
    
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
        console.log('Authentication failed:', { 
          status: response.status, 
          error: data.error 
        })
        setIsLoading(false)
        // Clear validation timestamp on failed authentication to allow retry
        sessionStorage.removeItem('last_token_validation')
        
        if (response.status === 429) {
          return { success: false, error: 'Rate limit exceeded. Please wait a minute and try again.' }
        }
        if (response.status === 408) {
          return { success: false, error: 'Request timed out. Please check your internet connection and try again.' }
        }
        if (response.status === 503) {
          return { success: false, error: 'AniList API is temporarily unavailable. Please try again in a few minutes.' }
        }
        return { success: false, error: data.error || 'Authentication failed' }
      }

      // Update state with secure session data
      setAccessToken(data.accessToken)
      setUser(data.user)
      setTokenExpiresAt(data.expiresAt ? new Date(data.expiresAt) : null)
      
      // Mark successful validation time
      sessionStorage.setItem('last_token_validation', Date.now().toString())
      
      setIsLoading(false)
      
      console.log('Authentication successful:', { user: data.user?.name })
      return { success: true }
    } catch (error) {
      console.error('Sign in error:', error)
      setIsLoading(false)
      // Clear validation timestamp on network error to allow retry
      sessionStorage.removeItem('last_token_validation')
      return { success: false, error: 'Network error or server is unavailable' }
    } finally {
      // Always remove from active requests and clear timeout
      clearTimeout(cleanupTimeout)
      activeRequests.current.delete(requestKey)
      console.log('Request completed, cleaned up:', { requestKey, remaining: activeRequests.current.size })
    }
  }, [])

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
      // Clear session storage and active requests FIRST to prevent race conditions
      sessionStorage.removeItem('last_token_validation')
      activeRequests.current.clear()
      console.log('Cleared active requests and session data for logout')
      
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
      
      // Reset initialization flag to allow re-initialization
      initializationComplete.current = false
      
      // Clear any remaining localStorage data
      localStorage.removeItem('anilist_access_token')
      localStorage.removeItem('anilist_user_data')
      
      console.log('Logout complete - ready for re-authentication')
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