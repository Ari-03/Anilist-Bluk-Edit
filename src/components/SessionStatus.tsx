import React, { useEffect, useState } from 'react'
import Image from 'next/image'
import { useAuth } from '@/contexts/AuthContext'
import { Clock, AlertTriangle, RefreshCw, LogOut } from 'lucide-react'

const SessionStatus: React.FC = () => {
  const { user, tokenExpiresAt, signOut, refreshSession, isAuthenticated } = useAuth()
  const [timeUntilExpiry, setTimeUntilExpiry] = useState<string>('')
  const [showWarning, setShowWarning] = useState(false)

  useEffect(() => {
    if (!tokenExpiresAt || !isAuthenticated) return

    const updateTimeRemaining = () => {
      const now = new Date()
      const expiryDate = new Date(tokenExpiresAt)
      const timeDiff = expiryDate.getTime() - now.getTime()

      if (timeDiff <= 0) {
        setTimeUntilExpiry('Expired')
        setShowWarning(true)
        return
      }

      // Show warning if less than 30 days remaining
      const daysRemaining = Math.floor(timeDiff / (1000 * 60 * 60 * 24))
      setShowWarning(daysRemaining <= 30)

      if (daysRemaining > 30) {
        setTimeUntilExpiry(`${daysRemaining} days`)
      } else if (daysRemaining > 0) {
        setTimeUntilExpiry(`${daysRemaining} days`)
      } else {
        const hoursRemaining = Math.floor(timeDiff / (1000 * 60 * 60))
        if (hoursRemaining > 0) {
          setTimeUntilExpiry(`${hoursRemaining} hours`)
        } else {
          const minutesRemaining = Math.floor(timeDiff / (1000 * 60))
          setTimeUntilExpiry(`${minutesRemaining} minutes`)
        }
      }
    }

    updateTimeRemaining()
    const interval = setInterval(updateTimeRemaining, 60000) // Update every minute

    return () => clearInterval(interval)
  }, [tokenExpiresAt, isAuthenticated])

  if (!isAuthenticated || !user) return null

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0">
            {user.avatar?.medium && (
              <Image
                src={user.avatar.medium}
                alt={user.name}
                width={40}
                height={40}
                className="rounded-full"
              />
            )}
          </div>
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white">
              {user.name}
            </h3>
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <Clock className="h-4 w-4" />
              <span>
                Token expires in {timeUntilExpiry}
              </span>
              {showWarning && (
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={refreshSession}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Refresh session"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={signOut}
            className="p-2 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      {showWarning && (
        <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-800 dark:text-amber-300">
              <p className="font-medium">Token Expiration Warning</p>
              <p>
                Your access token will expire in {timeUntilExpiry}. 
                {timeUntilExpiry === 'Expired' 
                  ? ' Please sign in again to continue using the application.'
                  : ' You may need to generate a new token soon.'
                }
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SessionStatus