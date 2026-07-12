import { AccountError } from './types'

export const ANILIST_OAUTH_AUTHORIZE_URL =
  'https://anilist.co/api/v2/oauth/authorize'

export const OAUTH_INTENT_STORAGE_KEY = 'anilist-bulk-edit:oauth-intent'

export interface OAuthIntent {
  state: string
  returnTo: string
  createdAt: number
}

export interface OAuthIntentStore {
  save(intent: OAuthIntent): void
  take(): OAuthIntent | null
}

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export class SessionOAuthIntentStore implements OAuthIntentStore {
  constructor(
    private readonly storage: StorageLike,
    private readonly key = OAUTH_INTENT_STORAGE_KEY,
  ) {}

  save(intent: OAuthIntent): void {
    this.storage.setItem(this.key, JSON.stringify(intent))
  }

  take(): OAuthIntent | null {
    const serialized = this.storage.getItem(this.key)
    this.storage.removeItem(this.key)
    if (!serialized) return null

    try {
      const candidate = JSON.parse(serialized) as Partial<OAuthIntent>
      if (
        typeof candidate.state !== 'string' ||
        typeof candidate.returnTo !== 'string' ||
        typeof candidate.createdAt !== 'number'
      ) {
        return null
      }
      return candidate as OAuthIntent
    } catch {
      return null
    }
  }
}

export interface ParsedOAuthFragment {
  accessToken: string
  state: string
  expiresInSeconds: number
}

export function parseOAuthFragment(fragment: string): ParsedOAuthFragment {
  const parameters = new URLSearchParams(
    fragment.startsWith('#') ? fragment.slice(1) : fragment,
  )
  const oauthError = parameters.get('error')
  if (oauthError) {
    throw new AccountError(
      'oauth-error',
      parameters.get('error_description') ?? `AniList authorization failed: ${oauthError}`,
    )
  }

  const accessToken = parameters.get('access_token')
  const state = parameters.get('state')
  if (!accessToken) {
    throw new AccountError(
      'oauth-token-missing',
      'The AniList callback did not include an access token.',
    )
  }
  if (!state) {
    throw new AccountError(
      'oauth-state-mismatch',
      'The AniList callback did not include the expected state.',
    )
  }

  const parsedExpiry = Number(parameters.get('expires_in'))
  const expiresInSeconds =
    Number.isFinite(parsedExpiry) && parsedExpiry > 0
      ? parsedExpiry
      : 365 * 24 * 60 * 60

  return { accessToken, state, expiresInSeconds }
}

export function buildAniListAuthorizationUrl(
  clientId: string,
  state: string,
): string {
  const url = new URL(ANILIST_OAUTH_AUTHORIZE_URL)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('response_type', 'token')
  url.searchParams.set('state', state)
  return url.toString()
}

export function createOAuthState(cryptoSource: Crypto = globalThis.crypto): string {
  if (!cryptoSource?.getRandomValues) {
    throw new Error('Secure random values are unavailable in this browser.')
  }

  const bytes = new Uint8Array(32)
  cryptoSource.getRandomValues(bytes)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function normalizeReturnTo(returnTo?: string): string {
  return returnTo?.startsWith('/') && !returnTo.startsWith('//')
    ? returnTo
    : '/'
}

interface LocationLike {
  hash: string
  pathname: string
  search: string
}

interface HistoryLike {
  replaceState(data: unknown, unused: string, url?: string | URL | null): void
}

/**
 * Captures and removes the credential-bearing hash synchronously. Call this at
 * the very start of the callback page, before rendering, analytics, or I/O.
 */
export function captureAndClearOAuthFragment(
  location: LocationLike,
  history: HistoryLike,
): string {
  const fragment = location.hash
  if (fragment) history.replaceState(null, '', `${location.pathname}${location.search}`)
  return fragment
}
