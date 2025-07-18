import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { User } from '@/types/anilist'

interface AuthContextType {
  user: User | null
  accessToken: string | null
  isLoading: boolean
  signIn: (token: string) => Promise<{ success: boolean; error?: string }>
  signOut: () => void
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

  // Load stored auth data on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('anilist_access_token')
    const storedUser = localStorage.getItem('anilist_user_data')
    
    if (storedToken && storedUser) {
      try {
        const userData = JSON.parse(storedUser)
        setAccessToken(storedToken)
        setUser(userData)
      } catch (error) {
        console.error('Error parsing stored user data:', error)
        // Clear invalid data
        localStorage.removeItem('anilist_access_token')
        localStorage.removeItem('anilist_user_data')
      }
    }
    
    setIsLoading(false)
  }, [])

  const signIn = async (token: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true)
    
    try {
      const response = await fetch('/api/auth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      })

      const data = await response.json()

      if (!response.ok) {
        setIsLoading(false)
        return { success: false, error: data.error || 'Authentication failed' }
      }

      // Store auth data
      localStorage.setItem('anilist_access_token', token)
      localStorage.setItem('anilist_user_data', JSON.stringify(data.user))
      
      setAccessToken(token)
      setUser(data.user)
      setIsLoading(false)
      
      return { success: true }
    } catch (error) {
      console.error('Sign in error:', error)
      setIsLoading(false)
      return { success: false, error: 'Network error or server is unavailable' }
    }
  }

  const signOut = () => {
    localStorage.removeItem('anilist_access_token')
    localStorage.removeItem('anilist_user_data')
    setAccessToken(null)
    setUser(null)
  }

  const value: AuthContextType = {
    user,
    accessToken,
    isLoading,
    signIn,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}