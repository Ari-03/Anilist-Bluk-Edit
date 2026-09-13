import React, { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import { useAuth, takeAddAccountIntent, AddAccountIntent, SignInResult } from '@/contexts/AuthContext'
import { Loader2, CheckCircle, XCircle, ArrowLeft, ExternalLink, RefreshCw } from 'lucide-react'

const AuthCallback: React.FC = () => {
  const router = useRouter()
  const { signInWithToken, signInWithOAuth } = useAuth()
  const [status, setStatus] = useState<'processing' | 'success' | 'same-account' | 'error'>('processing')
  const [error, setError] = useState<string>('')
  // Set when "add another account" came back with the account that was already active
  const [repeat, setRepeat] = useState<{ name: string; intent: AddAccountIntent } | null>(null)
  // Reuse the token exchange when Strict Mode subscribes to this effect twice.
  const signInRequest = useRef<Promise<SignInResult> | null>(null)

  useEffect(() => {
    let isMounted = true
    let redirectTimeout: ReturnType<typeof setTimeout> | undefined

    const handleCallback = async () => {
      try {
        // Extract access token from URL fragment
        const fragment = window.location.hash.substring(1)

        const params = new URLSearchParams(fragment)
        const accessToken = params.get('access_token')
        const error = params.get('error')
        const errorDescription = params.get('error_description')

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

        // Use the new secure sign-in method
        signInRequest.current ??= signInWithToken(accessToken)
        const result = await signInRequest.current

        if (!isMounted) return // Component unmounted during async operation

        if (result.success) {
          // Clear the URL fragment to prevent re-processing
          window.history.replaceState(null, '', window.location.pathname)

          const intent = takeAddAccountIntent()
          if (intent && intent.fromUserId === result.user.id) {
            setStatus('same-account')
            setRepeat({ name: result.user.name, intent })
            return
          }

          setStatus('success')
          // Redirect to main app after a brief success message
          redirectTimeout = setTimeout(() => {
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
      clearTimeout(redirectTimeout)
    }
  }, [router, signInWithToken])

  const handleRetry = () => {
    router.push('/')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 text-center">
        {status === 'processing' && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Authenticating...</h1>
            <p className="text-gray-600 dark:text-gray-400">Processing your AniList authentication</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Authentication Successful!</h1>
            <p className="text-gray-600 dark:text-gray-400">Redirecting to the application...</p>
          </>
        )}

        {status === 'same-account' && repeat && (
          <>
            <XCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Still signed in as {repeat.name}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              AniList hands back whichever account is signed in on anilist.co, and that is still {repeat.name}. Sign out
              there (avatar menu → Logout), log into the other account, then try again.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <a
                href="https://anilist.co"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                Open anilist.co
              </a>
              <button
                onClick={() => signInWithOAuth(repeat.intent.clientId, { addAccount: true })}
                className="inline-flex items-center gap-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-medium py-2 px-4 rounded-md transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Try again
              </button>
              <button
                onClick={handleRetry}
                className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:underline font-medium py-2 px-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to app
              </button>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="h-12 w-12 text-red-600 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Authentication Failed</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
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
