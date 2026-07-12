import {
  buildAniListAuthorizationUrl,
  createOAuthState,
  normalizeReturnTo,
  parseOAuthFragment,
  type OAuthIntentStore,
} from './oauth'
import type { AccountStorage, StoredAccount } from './storage'
import {
  AccountError,
  type AccountId,
  type AccountManager,
  type AccountSummary,
  type AccountViewerGateway,
  type ViewerIdentity,
} from './types'

const OAUTH_INTENT_TTL_MS = 10 * 60 * 1_000
const LEGACY_TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1_000

const toSummary = (account: StoredAccount): AccountSummary => ({
  id: account.id,
  name: account.name,
  avatarUrl: account.avatarUrl,
  tokenExpiresAt: account.tokenExpiresAt,
  linkedAt: account.linkedAt,
  lastUsedAt: account.lastUsedAt,
  state: account.state,
})

const withoutCredential = (account: StoredAccount): StoredAccount => ({
  ...toSummary(account),
})

const requireReauthentication = (account: StoredAccount): StoredAccount => {
  const summary = { ...account }
  delete summary.accessToken
  return { ...summary, state: 'reauth-required' }
}

const sortAccounts = (accounts: readonly StoredAccount[]): StoredAccount[] =>
  [...accounts].sort(
    (left, right) =>
      right.lastUsedAt - left.lastUsedAt || left.name.localeCompare(right.name),
  )

export interface AccountManagerDependencies {
  storage: AccountStorage
  viewerGateway: AccountViewerGateway
  oauthIntentStore: OAuthIntentStore
  clientId: string
  navigate(url: string): void
  now?: () => number
  createState?: () => string
  confirmReplacement?: (
    existing: AccountSummary,
    incoming: ViewerIdentity,
  ) => boolean | Promise<boolean>
  onAccountRemoved?: (accountId: AccountId) => void | Promise<void>
  onForgetAll?: () => void | Promise<void>
}

/**
 * The concrete class exposes lifecycle operations needed by the composition
 * root, while the UI should depend only on AccountManager.
 */
export class BrowserAccountManager implements AccountManager {
  private readonly now: () => number
  private readonly createState: () => string
  private bootstrapped = false
  private accounts: StoredAccount[] = []
  private activeAccountId: AccountId | null = null

  constructor(private readonly dependencies: AccountManagerDependencies) {
    this.now = dependencies.now ?? Date.now
    this.createState = dependencies.createState ?? createOAuthState
  }

  async bootstrap(): Promise<void> {
    await this.dependencies.storage.bootstrap()
    const now = this.now()
    const accounts = await this.dependencies.storage.listAccounts()

    for (const account of accounts) {
      if (
        account.state === 'ready' &&
        (!account.accessToken || account.tokenExpiresAt <= now)
      ) {
        await this.dependencies.storage.putAccount(
          requireReauthentication(account),
        )
      }
    }

    await this.reloadAccounts()
    this.activeAccountId =
      this.accounts.find((account) => account.state === 'ready')?.id ??
      this.accounts[0]?.id ??
      null
    this.bootstrapped = true
  }

  listAccounts(): readonly AccountSummary[] {
    this.assertBootstrapped()
    return Object.freeze(this.accounts.map((account) => Object.freeze(toSummary(account))))
  }

  getActiveAccount(): AccountSummary | null {
    this.assertBootstrapped()
    const active = this.accounts.find(
      (account) => account.id === this.activeAccountId,
    )
    return active ? toSummary(active) : null
  }

  beginOAuthLink(returnTo?: string): void {
    this.assertBootstrapped()
    if (!this.dependencies.clientId) {
      throw new Error('NEXT_PUBLIC_ANILIST_CLIENT_ID is not configured.')
    }

    const state = this.createState()
    this.dependencies.oauthIntentStore.save({
      state,
      returnTo: normalizeReturnTo(returnTo),
      createdAt: this.now(),
    })
    this.dependencies.navigate(
      buildAniListAuthorizationUrl(this.dependencies.clientId, state),
    )
  }

  async completeOAuthLink(fragment: string): Promise<AccountSummary> {
    this.assertBootstrapped()
    const callback = parseOAuthFragment(fragment)
    const intent = this.dependencies.oauthIntentStore.take()
    this.validateIntent(intent, callback.state)

    let viewer: ViewerIdentity
    try {
      viewer = await this.dependencies.viewerGateway.getViewer(callback.accessToken)
    } catch (error) {
      throw new AccountError(
        'oauth-token-invalid',
        'AniList did not accept this access token.',
        { cause: error },
      )
    }
    this.validateViewer(viewer)

    return this.storeLinkedAccount(
      viewer,
      callback.accessToken,
      this.now() + callback.expiresInSeconds * 1_000,
    )
  }

  async importLegacyToken(accessToken: string): Promise<AccountSummary> {
    this.assertBootstrapped()
    let viewer: ViewerIdentity
    try {
      viewer = await this.dependencies.viewerGateway.getViewer(accessToken)
    } catch (error) {
      throw new AccountError(
        'oauth-token-invalid',
        'AniList did not accept the legacy access token.',
        { cause: error },
      )
    }
    this.validateViewer(viewer)
    return this.storeLinkedAccount(
      viewer,
      accessToken,
      this.now() + LEGACY_TOKEN_TTL_MS,
    )
  }

  async activate(accountId: AccountId): Promise<void> {
    this.assertBootstrapped()
    const account = await this.dependencies.storage.getAccount(accountId)
    if (!account) {
      throw new AccountError('account-not-found', 'That linked account no longer exists.')
    }

    const current =
      account.state === 'ready' && account.tokenExpiresAt <= this.now()
        ? requireReauthentication(account)
        : account
    const activated = { ...current, lastUsedAt: this.now() }
    await this.dependencies.storage.putAccount(activated)
    this.activeAccountId = accountId
    await this.reloadAccounts()
  }

  async remove(accountId: AccountId): Promise<void> {
    this.assertBootstrapped()
    if (!(await this.dependencies.storage.getAccount(accountId))) {
      throw new AccountError('account-not-found', 'That linked account no longer exists.')
    }

    await this.dependencies.storage.deleteAccount(accountId)
    await this.dependencies.onAccountRemoved?.(accountId)
    await this.reloadAccounts()
    if (this.activeAccountId === accountId) {
      this.activeAccountId =
        this.accounts.find((account) => account.state === 'ready')?.id ??
        this.accounts[0]?.id ??
        null
    }
  }

  async forgetAll(): Promise<void> {
    this.assertBootstrapped()
    await this.dependencies.storage.clearAll()
    await this.dependencies.onForgetAll?.()
    this.accounts = []
    this.activeAccountId = null
  }

  async markReauthenticationRequired(accountId: AccountId): Promise<void> {
    this.assertBootstrapped()
    const account = await this.dependencies.storage.getAccount(accountId)
    if (!account) return
    await this.dependencies.storage.putAccount(requireReauthentication(account))
    await this.reloadAccounts()
  }

  /**
   * Keeps the credential within the account module and releases it only to a
   * short-lived operation supplied by the application composition root.
   */
  async withAccessToken<T>(
    accountId: AccountId,
    operation: (accessToken: string) => Promise<T>,
  ): Promise<T> {
    this.assertBootstrapped()
    const account = await this.dependencies.storage.getAccount(accountId)
    if (
      !account?.accessToken ||
      account.state !== 'ready' ||
      account.tokenExpiresAt <= this.now()
    ) {
      if (account) await this.markReauthenticationRequired(accountId)
      throw new AccountError(
        'reauth-required',
        'Reconnect this AniList account before continuing.',
      )
    }
    return operation(account.accessToken)
  }

  private async storeLinkedAccount(
    viewer: ViewerIdentity,
    accessToken: string,
    tokenExpiresAt: number,
  ): Promise<AccountSummary> {
    const existing = await this.dependencies.storage.getAccount(viewer.id)
    if (existing) {
      const confirmed = await this.dependencies.confirmReplacement?.(
        toSummary(existing),
        viewer,
      )
      if (!confirmed) {
        throw new AccountError(
          'replacement-declined',
          'The existing linked account was not replaced.',
        )
      }
    }

    const now = this.now()
    const account: StoredAccount = {
      id: viewer.id,
      name: viewer.name,
      avatarUrl: viewer.avatarUrl,
      accessToken,
      tokenExpiresAt,
      linkedAt: existing?.linkedAt ?? now,
      lastUsedAt: now,
      state: 'ready',
    }
    await this.dependencies.storage.putAccount(account)
    this.activeAccountId = account.id
    await this.reloadAccounts()
    return toSummary(account)
  }

  private validateIntent(
    intent: { state: string; createdAt: number } | null,
    returnedState: string,
  ): void {
    if (!intent) {
      throw new AccountError(
        'oauth-intent-missing',
        'This AniList authorization attempt is no longer available.',
      )
    }
    if (intent.state !== returnedState) {
      throw new AccountError(
        'oauth-state-mismatch',
        'The AniList authorization state did not match.',
      )
    }
    if (this.now() - intent.createdAt > OAUTH_INTENT_TTL_MS) {
      throw new AccountError(
        'oauth-intent-expired',
        'This AniList authorization attempt has expired. Please try again.',
      )
    }
  }

  private validateViewer(viewer: ViewerIdentity): void {
    if (
      !Number.isSafeInteger(viewer.id) ||
      viewer.id <= 0 ||
      !viewer.name.trim()
    ) {
      throw new AccountError(
        'oauth-token-invalid',
        'AniList returned an invalid Viewer for this token.',
      )
    }
  }

  private async reloadAccounts(): Promise<void> {
    this.accounts = sortAccounts(
      await this.dependencies.storage.listAccounts(),
    ).map(withoutCredential)
  }

  private assertBootstrapped(): void {
    if (!this.bootstrapped) {
      throw new AccountError(
        'not-bootstrapped',
        'The account manager has not finished starting up.',
      )
    }
  }
}
