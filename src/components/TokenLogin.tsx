import React, { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Eye, EyeOff, ExternalLink, Info, Zap, LogIn } from 'lucide-react'
import TokenGenerator from '@/components/TokenGenerator'

const TokenLogin: React.FC = () => {
  const { signIn, signInWithOAuth, isLoading } = useAuth()
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [oauthClientId, setOauthClientId] = useState('')
  const [showOAuthSetup, setShowOAuthSetup] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token.trim()) {
      setError('Please enter your access token')
      return
    }

    setIsSubmitting(true)
    setError('')

    const result = await signIn(token.trim())
    
    if (!result.success) {
      setError(result.error || 'Authentication failed')
    }
    
    setIsSubmitting(false)
  }

  const handleTokenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setToken(e.target.value)
    if (error) setError('') // Clear error when user starts typing
  }

  const handleOAuthLogin = () => {
    if (!oauthClientId.trim() && !process.env.NEXT_PUBLIC_ANILIST_CLIENT_ID) {
      setError('Please enter your AniList Client ID or configure it in environment variables')
      return
    }
    
    setError('')
    signInWithOAuth(oauthClientId.trim() || undefined)
  }

  const hasConfiguredClientId = !!process.env.NEXT_PUBLIC_ANILIST_CLIENT_ID

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            AniList Bulk Edit
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Sign in with AniList to continue
          </p>
        </div>

        {/* OAuth Login Section */}
        <div className="mb-6">
          {hasConfiguredClientId ? (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium text-green-900 dark:text-green-200 mb-1">
                    Quick Login Available
                  </h3>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    OAuth is configured for seamless authentication
                  </p>
                </div>
                <button
                  onClick={handleOAuthLogin}
                  disabled={isLoading}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-md transition-colors flex items-center gap-2"
                >
                  <LogIn className="h-4 w-4" />
                  Login with AniList
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-blue-900 dark:text-blue-200 mb-2 flex items-center">
                    <LogIn className="h-5 w-5 mr-2" />
                    OAuth Login
                  </h3>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
                    For a seamless login experience, enter your AniList Client ID below
                  </p>
                  {!showOAuthSetup && (
                    <button
                      onClick={() => setShowOAuthSetup(true)}
                      className="text-blue-600 dark:text-blue-400 underline text-sm hover:text-blue-800 dark:hover:text-blue-200"
                    >
                      Set up OAuth login
                    </button>
                  )}
                </div>
              </div>
              
              {showOAuthSetup && (
                <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-700">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={oauthClientId}
                      onChange={(e) => setOauthClientId(e.target.value)}
                      placeholder="Enter your AniList Client ID"
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                      disabled={isLoading}
                    />
                    <button
                      onClick={handleOAuthLogin}
                      disabled={isLoading || !oauthClientId.trim()}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-md transition-colors flex items-center gap-2 text-sm"
                    >
                      <LogIn className="h-4 w-4" />
                      Login
                    </button>
                  </div>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    Need a Client ID? Check the setup instructions below.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="text-center">
            <span className="text-sm text-gray-500 dark:text-gray-400">or</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="token" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Manual Token Entry
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Enter your AniList personal access token manually
            </p>
            <div className="relative">
              <input
                id="token"
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={handleTokenChange}
                placeholder="Enter your AniList access token"
                className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                disabled={isSubmitting || isLoading}
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                disabled={isSubmitting || isLoading}
              >
                {showToken ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
              <div className="flex">
                <Info className="h-4 w-4 text-red-400 mt-0.5 mr-2 flex-shrink-0" />
                <div className="text-sm text-red-700 dark:text-red-400">{error}</div>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || isLoading || !token.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {isSubmitting ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center">
            <Zap className="h-5 w-5 mr-2 text-yellow-500" />
            Generate Your Token
          </h3>
          <TokenGenerator onTokenGenerated={setToken} />
        </div>
      </div>
    </div>
  )
}

export default TokenLogin