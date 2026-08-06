import React, { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { LogIn, AlertCircle, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The OAuth sign-in form, reusable both on the login screen and inside the
 * "add another account" dialog.
 */
export default function TokenLoginForm() {
    const { signInWithOAuth, isLoading } = useAuth()
    const [error, setError] = useState('')
    const [oauthClientId, setOauthClientId] = useState('')
    const [showSetup, setShowSetup] = useState(false)

    const hasConfiguredClientId = !!process.env.NEXT_PUBLIC_ANILIST_CLIENT_ID

    const handleOAuthLogin = () => {
        if (!oauthClientId.trim() && !hasConfiguredClientId) {
            setError('Enter your AniList Client ID first')
            setShowSetup(true)
            return
        }
        setError('')
        signInWithOAuth(oauthClientId.trim() || undefined)
    }

    return (
        <div className="space-y-4">
            <button
                onClick={handleOAuthLogin}
                disabled={isLoading}
                className="btn-primary w-full h-12 text-base"
            >
                <LogIn className="h-5 w-5" />
                {isLoading ? 'Connecting…' : 'Log in with AniList'}
            </button>

            {!hasConfiguredClientId && (
                <div>
                    <button
                        onClick={() => setShowSetup(!showSetup)}
                        className="flex items-center gap-1 text-xs font-medium text-fg-muted hover:text-fg transition-colors mx-auto"
                    >
                        <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showSetup && 'rotate-180')} />
                        Use your own Client ID
                    </button>
                    {showSetup && (
                        <div className="mt-3 space-y-2">
                            <input
                                type="text"
                                value={oauthClientId}
                                onChange={(e) => setOauthClientId(e.target.value)}
                                placeholder="AniList Client ID"
                                className="input"
                                disabled={isLoading}
                            />
                            <p className="text-xs text-fg-subtle">
                                Create one under{' '}
                                <a
                                    href="https://anilist.co/settings/developer"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-accent hover:underline"
                                >
                                    AniList Developer settings
                                </a>
                                {' '}with redirect URL set to this app&apos;s <code className="text-fg-muted">/auth/callback</code>.
                            </p>
                        </div>
                    )}
                </div>
            )}

            {error && (
                <div className="flex items-center gap-2.5 rounded-lg bg-danger/10 border border-danger/25 p-3">
                    <AlertCircle className="h-4 w-4 text-danger flex-shrink-0" />
                    <p className="text-sm text-fg">{error}</p>
                </div>
            )}
        </div>
    )
}
