import { describe, expect, it, vi } from 'vitest'

import {
  BrowserAccountManager,
  InMemoryAccountStorage,
  SessionOAuthIntentStore,
  captureAndClearOAuthFragment,
  deleteLegacyAuthentication,
  discoverLegacyAccount,
  importLegacyAccount,
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

describe('OAuth callback safety', () => {
  it('captures and clears the URL fragment synchronously', () => {
    const history = { replaceState: vi.fn() }
    const location = {
      hash: '#access_token=never-log-this&state=state',
      pathname: '/auth/callback',
      search: '?from=link',
    }

    const fragment = captureAndClearOAuthFragment(location, history)

    expect(fragment).toBe('#access_token=never-log-this&state=state')
    expect(history.replaceState).toHaveBeenCalledWith(
      null,
      '',
      '/auth/callback?from=link',
    )
  })
})

describe('legacy authentication migration', () => {
  it('discovers Zustand credentials without mutating legacy storage', () => {
    const legacyStorage = new MemoryWebStorage()
    legacyStorage.setItem(
      'anilist-bulk-edit-store',
      JSON.stringify({ state: { accessToken: 'legacy-secret' }, version: 0 }),
    )

    const migration = discoverLegacyAccount(legacyStorage)

    expect(migration?.summary).toEqual({ source: 'zustand' })
    expect(migration).not.toHaveProperty('accessToken')
    expect(JSON.stringify(migration)).not.toContain('legacy-secret')
    expect(legacyStorage.getItem('anilist-bulk-edit-store')).not.toBeNull()
  })

  it('validates an explicit import before deleting every legacy auth key', async () => {
    const legacyStorage = new MemoryWebStorage()
    legacyStorage.setItem(
      'anilist-bulk-edit-store',
      JSON.stringify({ state: { accessToken: 'legacy-secret' } }),
    )
    legacyStorage.setItem('anilist_access_token', 'legacy-secret')
    legacyStorage.setItem('anilist_user_data', '{"id":9}')
    legacyStorage.setItem('anilist_last_validation', '1')
    const storage = new InMemoryAccountStorage()
    const manager = new BrowserAccountManager({
      storage,
      oauthIntentStore: new SessionOAuthIntentStore(new MemoryWebStorage()),
      viewerGateway: {
        getViewer: async (token) => {
          expect(token).toBe('legacy-secret')
          return { id: 9, name: 'Legacy', avatarUrl: null }
        },
      },
      clientId: '1',
      navigate: () => undefined,
      now: () => 1_000,
    })
    await manager.bootstrap()
    const candidate = discoverLegacyAccount(legacyStorage)
    expect(candidate).not.toBeNull()

    const account = await importLegacyAccount(
      candidate!,
      manager,
      legacyStorage,
    )

    expect(account).toMatchObject({ id: 9, name: 'Legacy', state: 'ready' })
    expect(legacyStorage.getItem('anilist-bulk-edit-store')).toBeNull()
    expect(legacyStorage.getItem('anilist_access_token')).toBeNull()
    expect(legacyStorage.getItem('anilist_user_data')).toBeNull()
    expect(legacyStorage.getItem('anilist_last_validation')).toBeNull()
  })

  it('can delete legacy credentials without importing them', () => {
    const legacyStorage = new MemoryWebStorage()
    legacyStorage.setItem('anilist_access_token', 'delete-me')
    legacyStorage.setItem('anilist_user_data', '{"id":9}')

    deleteLegacyAuthentication(legacyStorage)

    expect(discoverLegacyAccount(legacyStorage)).toBeNull()
    expect(legacyStorage.getItem('anilist_user_data')).toBeNull()
  })
})
