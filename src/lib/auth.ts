// Account lifecycle. The persisted accounts registry in the store is the only
// place tokens live; the browser talks to AniList directly with the active one.
import { useStore } from '@/store'
import { AniListClient } from '@/lib/anilist'
import { errorMessage, isInvalidTokenError } from '@/lib/graphql'
import { User } from '@/types/anilist'

export type SignInResult = { success: true; user: User } | { success: false; error: string }

const byAddedAt = (a: { addedAt: number }, b: { addedAt: number }) => a.addedAt - b.addedAt

/** Validates a token (also resolving whose it is) and makes that account active */
export async function signInWithToken(token: string): Promise<SignInResult> {
    try {
        const user = await new AniListClient(token).getCurrentUser()
        useStore.getState().upsertAccount(user, token)
        return { success: true, user }
    } catch (error) {
        return {
            success: false,
            error: isInvalidTokenError(error) ? 'AniList rejected this token' : errorMessage(error),
        }
    }
}

/** Switches to a saved account instantly; call refreshProfile to re-validate it */
export function activateAccount(id: number) {
    const account = useStore.getState().accounts[id]
    if (account) useStore.getState().upsertAccount(account.user, account.accessToken)
}

/**
 * Re-fetches the active account's profile, so custom lists created on
 * anilist.co show up. Only a definitive token rejection signs the account
 * out; rate limits and outages keep the cached profile.
 */
export async function refreshProfile({ quiet = false } = {}): Promise<void> {
    const { activeAccountId, accessToken } = useStore.getState()
    if (activeAccountId == null || !accessToken) return

    try {
        const user = await new AniListClient(accessToken).getCurrentUser()
        // The user may have switched accounts while this was in flight
        if (useStore.getState().activeAccountId === activeAccountId) {
            useStore.getState().upsertAccount(user, accessToken)
        }
    } catch (error) {
        const store = useStore.getState()
        if (store.activeAccountId !== activeAccountId) return
        if (isInvalidTokenError(error)) {
            const name = store.user?.name ?? 'This account'
            signOutAccount(activeAccountId)
            store.addNotification({
                type: 'error',
                message: `${name}'s AniList login expired or was revoked. Sign in again to re-link it.`,
            })
        } else if (!quiet) {
            store.addNotification({ type: 'error', message: 'Could not refresh your profile from AniList' })
        }
    }
}

/** Forgets one account; if it was active, the oldest remaining account takes over */
export function signOutAccount(id: number) {
    const store = useStore.getState()
    const wasActive = store.activeAccountId === id
    store.removeAccount(id)
    if (!wasActive) return

    const next = Object.values(useStore.getState().accounts).sort(byAddedAt)[0]
    if (next) {
        activateAccount(next.user.id)
        void refreshProfile({ quiet: true })
    } else {
        store.logout()
    }
}

export const signOutAll = () => useStore.getState().logout()

// --- OAuth (implicit grant) ---

// Remembered across the round-trip through anilist.co. `state` ties the
// callback to a login this tab started, so a crafted callback link can't sign
// someone into another account. `addAccountFrom` lets the callback notice
// AniList handing back the account that was already active: its OAuth page
// authorizes whoever is logged in there and can't force a fresh login.
const OAUTH_KEY = 'anilist_oauth_pending'

export interface PendingOAuth {
    state: string
    clientId?: string
    addAccountFrom?: number
}

export function startOAuth(clientId?: string, { addAccount = false } = {}) {
    const resolvedClientId = clientId || process.env.NEXT_PUBLIC_ANILIST_CLIENT_ID
    if (!resolvedClientId) {
        console.error('No AniList client ID provided or configured')
        return
    }

    const pending: PendingOAuth = {
        state: crypto.randomUUID(),
        clientId,
        addAccountFrom: addAccount ? useStore.getState().activeAccountId ?? undefined : undefined,
    }
    sessionStorage.setItem(OAUTH_KEY, JSON.stringify(pending))

    // No redirect_uri: AniList's implicit flow uses the one configured for the client
    const params = new URLSearchParams({ client_id: resolvedClientId, response_type: 'token', state: pending.state })
    window.location.href = `https://anilist.co/api/v2/oauth/authorize?${params}`
}

/** Reads and clears the pending login. Null unless `state` matches the one this tab sent. */
export function takePendingOAuth(state: string | null): PendingOAuth | null {
    const raw = sessionStorage.getItem(OAUTH_KEY)
    sessionStorage.removeItem(OAUTH_KEY)
    if (!raw || !state) return null
    try {
        const pending = JSON.parse(raw) as PendingOAuth
        return pending.state === state ? pending : null
    } catch {
        return null
    }
}
