export type AccountId = number

export type AccountState = 'ready' | 'reauth-required'

export interface AccountSummary {
  id: AccountId
  name: string
  avatarUrl: string | null
  tokenExpiresAt: number
  linkedAt: number
  lastUsedAt: number
  state: AccountState
}

export interface AccountManager {
  bootstrap(): Promise<void>
  listAccounts(): readonly AccountSummary[]
  getActiveAccount(): AccountSummary | null
  beginOAuthLink(returnTo?: string): void
  completeOAuthLink(fragment: string): Promise<AccountSummary>
  activate(accountId: AccountId): Promise<void>
  remove(accountId: AccountId): Promise<void>
  forgetAll(): Promise<void>
}

export type AccountMediaType = 'ANIME' | 'MANGA'

export type PreferenceValue =
  | boolean
  | number
  | string
  | null
  | readonly PreferenceValue[]
  | { readonly [key: string]: PreferenceValue }

/**
 * UI preferences are deliberately account and media-type scoped. The account
 * module does not interpret filter values; the list-query module owns those
 * semantics and can version its payload independently.
 */
export interface AccountMediaPreferences {
  filters: Readonly<Record<string, PreferenceValue>>
  viewMode: 'grid' | 'list'
  pageSize: 50 | 100 | 250
}

export interface ViewerIdentity {
  id: AccountId
  name: string
  avatarUrl: string | null
}

export interface AccountViewerGateway {
  getViewer(accessToken: string): Promise<ViewerIdentity>
}

export type AccountErrorCode =
  | 'not-bootstrapped'
  | 'account-not-found'
  | 'oauth-intent-missing'
  | 'oauth-state-mismatch'
  | 'oauth-intent-expired'
  | 'oauth-error'
  | 'oauth-token-missing'
  | 'oauth-token-invalid'
  | 'replacement-declined'
  | 'reauth-required'

export class AccountError extends Error {
  constructor(
    public readonly code: AccountErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'AccountError'
  }
}
