import React, { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { LogIn, AlertCircle } from 'lucide-react'

const TokenLogin: React.FC = () => {
  const { signInWithOAuth, isLoading } = useAuth()
  const [error, setError] = useState('')
  const [oauthClientId, setOauthClientId] = useState('')
  const [showOAuthSetup, setShowOAuthSetup] = useState(false)


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
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
            AniList Bulk Edit
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg">
            Sign in with AniList to continue
          </p>
        </div>

        {/* Centered OAuth Login */}
        <div className="space-y-6">
          {hasConfiguredClientId ? (
            <div className="text-center">
              <button
                onClick={handleOAuthLogin}
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-4 px-6 rounded-lg transition-colors flex items-center justify-center gap-3 text-lg shadow-lg hover:shadow-xl"
              >
                <LogIn className="h-6 w-6" />
                {isLoading ? 'Connecting...' : 'Login with AniList'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  Connect with AniList
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Enter your AniList Client ID to enable OAuth login
                </p>
              </div>
              
              {!showOAuthSetup ? (
                <div className="text-center">
                  <button
                    onClick={() => setShowOAuthSetup(true)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-lg transition-colors flex items-center justify-center gap-3 text-lg shadow-lg hover:shadow-xl"
                  >
                    <LogIn className="h-6 w-6" />
                    Set up AniList Login
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <input
                    type="text"
                    value={oauthClientId}
                    onChange={(e) => setOauthClientId(e.target.value)}
                    placeholder="Enter your AniList Client ID"
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-lg"
                    disabled={isLoading}
                  />
                  <button
                    onClick={handleOAuthLogin}
                    disabled={isLoading || !oauthClientId.trim()}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-4 px-6 rounded-lg transition-colors flex items-center justify-center gap-3 text-lg shadow-lg hover:shadow-xl"
                  >
                    <LogIn className="h-6 w-6" />
                    {isLoading ? 'Connecting...' : 'Login with AniList'}
                  </button>
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                    Need help? Check the AniList Developer settings to create your Client ID
                  </p>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex items-center">
                <AlertCircle className="h-5 w-5 text-red-400 mr-3 flex-shrink-0" />
                <div className="text-sm text-red-700 dark:text-red-400">{error}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TokenLogin