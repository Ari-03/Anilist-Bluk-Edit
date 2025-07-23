import React, { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/contexts/AuthContext'
import { Loader2, CheckCircle, XCircle, ArrowLeft } from 'lucide-react'

const AuthCallback: React.FC = () => {
  const router = useRouter()
  const { signInWithToken } = useAuth()
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing')
  const [error, setError] = useState<string>('')
  const processingRef = useRef(false)

  useEffect(() => {
    let isMounted = true // React Strict Mode protection

    const handleCallback = async () => {
      // Prevent duplicate processing (race condition and Strict Mode protection)
      if (processingRef.current) {
        console.log('OAuth callback already processing, skipping')
        return
      }
      
      processingRef.current = true

      try {
        // Extract access token from URL fragment
        const fragment = window.location.hash.substring(1)
        console.log('OAuth callback fragment:', fragment)
        
        const params = new URLSearchParams(fragment)
        const accessToken = params.get('access_token')
        const error = params.get('error')
        const errorDescription = params.get('error_description')
        const tokenType = params.get('token_type')
        const expiresIn = params.get('expires_in')

        console.log('OAuth callback params:', {
          accessToken: accessToken ? accessToken.substring(0, 10) + '...' : null,
          error,
          errorDescription,
          tokenType,
          expiresIn
        })

        if (error) {
          if (isMounted) {
            setStatus('error')
            setError(errorDescription || error || 'Authorization failed')
          }
          return
        }

        if (!accessToken) {
          if (isMounted) {
            setStatus('error')
            setError('No access token received from AniList')
          }
          return
        }

        console.log('Token format check:', {
          length: accessToken.length,
          startsCorrectly: accessToken.length > 10,
          type: typeof accessToken
        })

        // Use the new secure sign-in method
        const result = await signInWithToken(accessToken)
        
        if (!isMounted) return // Component unmounted during async operation
        
        if (result.success) {
          setStatus('success')
          // Clear the URL fragment to prevent re-processing
          window.history.replaceState(null, '', window.location.pathname)
          // Redirect to main app after a brief success message
          setTimeout(() => {
            if (isMounted) {
              router.push('/')
            }
          }, 1500)
        } else {
          setStatus('error')
          setError(result.error || 'Failed to authenticate with AniList')
        }
      } catch (err) {
        console.error('Callback error:', err)
        if (isMounted) {
          setStatus('error')
          setError('An unexpected error occurred during authentication')
        }
      }
    }

    handleCallback()

    // Cleanup function for React Strict Mode
    return () => {
      isMounted = false
      // Reset processing flag if component unmounts during processing
      processingRef.current = false
    }
  }, [router, signInWithToken])

  const handleRetry = () => {
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 text-center">
        {status === 'processing' && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Authenticating...
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Processing your AniList authentication
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Authentication Successful!
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Redirecting to the application...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="h-12 w-12 text-red-600 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Authentication Failed
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {error}
            </p>
            <button
              onClick={handleRetry}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Login
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default AuthCallback