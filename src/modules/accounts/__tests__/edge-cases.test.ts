import { describe, expect, it, vi } from 'vitest'

import {
  BrowserAccountManager,
  InMemoryAccountStorage,
  SessionOAuthIntentStore,
  captureAndClearOAuthFragment,
  createOAuthState,
  discoverLegacyAccount,
  normalizeReturnTo,
  parseOAuthFragment,
  type StorageLike,
} from '..'

class MemoryWebStorage implements StorageLike {
  private readonly values = new Map<string, string>()
  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
  removeItem(key: string): void {
    this.values.delete(key)
  }
}

function managerWith(
  options: {
    now?: number
    clientId?: string
    viewer?: { id: number; name: string; avatarUrl: string | null }
    viewerError?: Error
    intentCreatedAt?: number
  } = {},
) {
  const storage = new InMemoryAccountStorage()
  const session = new MemoryWebStorage()
  const now = options.now ?? 1_000_000
  const manager = new BrowserAccountManager({
    storage,
    oauthIntentStore: new SessionOAuthIntentStore(session),
    viewerGateway: {
      getViewer: async () => {
        if (options.viewerError) throw options.viewerError
        return options.viewer ?? { id: 1, name: 'Ari', avatarUrl: null }
      },
    },
    clientId: options.clientId ?? '1',
    navigate: vi.fn(),
    now: () => now,
    createState: () => 'state',
  })
  if (options.intentCreatedAt !== undefined) {
    session.setItem(
      'anilist-bulk-edit:oauth-intent',
      JSON.stringify({
        state: 'state',
        returnTo: '/',
        createdAt: options.intentCreatedAt,
      }),
    )
  }
  return { manager, session, storage }
}

describe('OAuth parsing edge cases', () => {
  it('rejects provider errors, missing tokens, and missing state', () => {
    expect(() => parseOAuthFragment('#error=access_denied')).toThrowError(
      expect.objectContaining({ code: 'oauth-error' }),
    )
    expect(() =>
      parseOAuthFragment('#error=access_denied&error_description=Nope'),
    ).toThrow('Nope')
    expect(() => parseOAuthFragment('#state=state')).toThrowError(
      expect.objectContaining({ code: 'oauth-token-missing' }),
    )
    expect(() => parseOAuthFragment('#access_token=secret')).toThrowError(
      expect.objectContaining({ code: 'oauth-state-mismatch' }),
    )
  })

  it('accepts a fragment without a hash and defaults an invalid expiry', () => {
    expect(
      parseOAuthFragment('access_token=secret&state=state&expires_in=invalid'),
    ).toEqual({
      accessToken: 'secret',
      state: 'state',
      expiresInSeconds: 365 * 24 * 60 * 60,
    })
    expect(
      parseOAuthFragment('#access_token=secret&state=state&expires_in=0')
        .expiresInSeconds,
    ).toBe(365 * 24 * 60 * 60)
  })

  it('validates session intent serialization and consumes every value once', () => {
    const storage = new MemoryWebStorage()
    const intents = new SessionOAuthIntentStore(storage)
    expect(intents.take()).toBeNull()
    storage.setItem('anilist-bulk-edit:oauth-intent', '{bad json')
    expect(intents.take()).toBeNull()
    storage.setItem(
      'anilist-bulk-edit:oauth-intent',
      JSON.stringify({ state: 1, returnTo: '/', createdAt: 2 }),
    )
    expect(intents.take()).toBeNull()
    intents.save({ state: 'ok', returnTo: '/', createdAt: 2 })
    expect(intents.take()).toEqual({ state: 'ok', returnTo: '/', createdAt: 2 })
    expect(intents.take()).toBeNull()
  })

  it('uses secure random bytes and rejects an unavailable crypto source', () => {
    const cryptoSource = {
      getRandomValues: <T extends ArrayBufferView | null>(array: T): T => {
        if (array instanceof Uint8Array) array.fill(15)
        return array
      },
    } as Crypto
    expect(createOAuthState(cryptoSource)).toBe('0f'.repeat(32))
    expect(() => createOAuthState({} as Crypto)).toThrow(
      'Secure random values are unavailable',
    )
  })

  it('accepts only same-origin relative return paths and skips history for no hash', () => {
    expect(normalizeReturnTo('/lists?page=2')).toBe('/lists?page=2')
    expect(normalizeReturnTo('//evil.example')).toBe('/')
    expect(normalizeReturnTo('https://evil.example')).toBe('/')
    expect(normalizeReturnTo()).toBe('/')

    const history = { replaceState: vi.fn() }
    expect(
      captureAndClearOAuthFragment(
        { hash: '', pathname: '/auth/callback', search: '' },
        history,
      ),
    ).toBe('')
    expect(history.replaceState).not.toHaveBeenCalled()
  })
})

describe('account lifecycle edge cases', () => {
  it('rejects use before bootstrap and a missing OAuth client id', async () => {
    const { manager } = managerWith({ clientId: '' })
    expect(() => manager.listAccounts()).toThrowError(
      expect.objectContaining({ code: 'not-bootstrapped' }),
    )
    await manager.bootstrap()
    expect(() => manager.beginOAuthLink()).toThrow(
      'NEXT_PUBLIC_ANILIST_CLIENT_ID',
    )
  })

  it('rejects expired intents before contacting Viewer', async () => {
    const { manager } = managerWith({
      now: 1_000_000,
      intentCreatedAt: 1_000_000 - 10 * 60 * 1_000 - 1,
    })
    await manager.bootstrap()
    await expect(
      manager.completeOAuthLink('#access_token=secret&state=state'),
    ).rejects.toMatchObject({ code: 'oauth-intent-expired' })
  })

  it('classifies rejected and malformed Viewer responses as invalid tokens', async () => {
    const rejected = managerWith({ viewerError: new Error('401') })
    await rejected.manager.bootstrap()
    rejected.manager.beginOAuthLink()
    await expect(
      rejected.manager.completeOAuthLink(
        '#access_token=secret&state=state&expires_in=60',
      ),
    ).rejects.toMatchObject({ code: 'oauth-token-invalid' })
    await expect(
      rejected.manager.importLegacyToken('secret'),
    ).rejects.toMatchObject({ code: 'oauth-token-invalid' })

    const malformed = managerWith({
      viewer: { id: 0, name: '', avatarUrl: null },
    })
    await malformed.manager.bootstrap()
    await expect(
      malformed.manager.importLegacyToken('secret'),
    ).rejects.toMatchObject({ code: 'oauth-token-invalid' })
  })

  it('handles missing accounts without mutating state', async () => {
    const { manager } = managerWith()
    await manager.bootstrap()
    await expect(manager.activate(999)).rejects.toMatchObject({
      code: 'account-not-found',
    })
    await expect(manager.remove(999)).rejects.toMatchObject({
      code: 'account-not-found',
    })
    await manager.markReauthenticationRequired(999)
    await expect(
      manager.withAccessToken(999, async () => 'never'),
    ).rejects.toMatchObject({ code: 'reauth-required' })
  })

  it('expires a token discovered during activation', async () => {
    const { manager, storage } = managerWith({ now: 100 })
    await storage.putAccount({
      id: 1,
      name: 'Ari',
      avatarUrl: null,
      accessToken: 'secret',
      tokenExpiresAt: 200,
      linkedAt: 1,
      lastUsedAt: 1,
      state: 'ready',
    })
    await manager.bootstrap()
    const account = await storage.getAccount(1)
    await storage.putAccount({ ...account!, tokenExpiresAt: 99 })

    await manager.activate(1)

    expect(manager.getActiveAccount()?.state).toBe('reauth-required')
    expect(await storage.getAccount(1)).not.toHaveProperty('accessToken')
  })
})

describe('legacy parsing edge cases', () => {
  it('falls back to the direct key for malformed or empty Zustand state', () => {
    const storage = new MemoryWebStorage()
    storage.setItem('anilist-bulk-edit-store', '{not json')
    storage.setItem('anilist_access_token', 'direct')
    const migration = discoverLegacyAccount(storage)
    expect(migration?.summary).toEqual({ source: 'direct' })
    expect(migration).not.toHaveProperty('accessToken')
    storage.setItem(
      'anilist-bulk-edit-store',
      JSON.stringify({ state: { accessToken: '' } }),
    )
    expect(discoverLegacyAccount(storage)?.summary.source).toBe('direct')
  })
})
