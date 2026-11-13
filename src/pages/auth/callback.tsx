import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { Loader2, CheckCircle, XCircle, ArrowLeft, ExternalLink, RefreshCw, UserX } from 'lucide-react'
import { PendingOAuth, signInWithToken, startOAuth, takePendingOAuth } from '@/lib/auth'
import StatusPage from '@/components/ui/StatusPage'

type Outcome =
    | { status: 'processing' }
    | { status: 'success' }
    | { status: 'same-account'; name: string; pending: PendingOAuth }
    | { status: 'error'; message: string }

/** Reads AniList's implicit-grant response from the URL fragment and signs in */
async function completeOAuth(): Promise<Outcome> {
    const params = new URLSearchParams(window.location.hash.substring(1))
    // The fragment holds a live token: get it out of the address bar and history first
    window.history.replaceState(null, '', window.location.pathname)

    const pending = takePendingOAuth(params.get('state'))
    const error = params.get('error')
    if (error) return { status: 'error', message: params.get('error_description') || error }

    const accessToken = params.get('access_token')
    if (!accessToken) return { status: 'error', message: 'No access token received from AniList' }
    if (!pending) {
        return {
            status: 'error',
            message: "This sign-in wasn't started from this tab, so it was ignored. Start again from the login page.",
        }
    }

    const result = await signInWithToken(accessToken)
    if (!result.success) return { status: 'error', message: result.error }
    if (pending.addAccountFrom === result.user.id) {
        return { status: 'same-account', name: result.user.name, pending }
    }
    return { status: 'success' }
}

export default function AuthCallback() {
    const router = useRouter()
    const [outcome, setOutcome] = useState<Outcome>({ status: 'processing' })
    // Strict Mode runs effects twice; the fragment and pending state can only be consumed once
    const request = useRef<Promise<Outcome> | null>(null)

    useEffect(() => {
        let active = true
        let redirect: ReturnType<typeof setTimeout> | undefined

        request.current ??= completeOAuth().catch((error: unknown) => {
            console.error('Callback error:', error)
            return { status: 'error', message: 'An unexpected error occurred during authentication' } as const
        })
        request.current.then(result => {
            if (!active) return
            setOutcome(result)
            if (result.status === 'success') redirect = setTimeout(() => router.push('/'), 1200)
        })

        return () => {
            active = false
            clearTimeout(redirect)
        }
    }, [router])

    const backHome = (
        <button onClick={() => router.push('/')} className="btn-secondary">
            <ArrowLeft className="w-4 h-4" />
            Back to app
        </button>
    )

    switch (outcome.status) {
        case 'processing':
            return (
                <StatusPage title="Signing in…" icon={Loader2} spin>
                    <p>Checking your AniList authorization</p>
                </StatusPage>
            )
        case 'success':
            return (
                <StatusPage title="Signed in" icon={CheckCircle} tone="success">
                    <p>Taking you to your lists…</p>
                </StatusPage>
            )
        case 'same-account':
            return (
                <StatusPage
                    title={`Still signed in as ${outcome.name}`}
                    icon={UserX}
                    tone="warning"
                    actions={
                        <>
                            <a href="https://anilist.co" target="_blank" rel="noopener noreferrer" className="btn-primary">
                                <ExternalLink className="w-4 h-4" />
                                Open anilist.co
                            </a>
                            <button
                                onClick={() => startOAuth(outcome.pending.clientId, { addAccount: true })}
                                className="btn-secondary"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Try again
                            </button>
                            {backHome}
                        </>
                    }
                >
                    <p>
                        AniList hands back whichever account is signed in on anilist.co, and that is still {outcome.name}.
                        Sign out there (avatar menu → Logout), log into the other account, then try again.
                    </p>
                </StatusPage>
            )
        case 'error':
            return (
                <StatusPage title="Sign-in failed" icon={XCircle} tone="danger" actions={backHome}>
                    <p>{outcome.message}</p>
                </StatusPage>
            )
    }
}
