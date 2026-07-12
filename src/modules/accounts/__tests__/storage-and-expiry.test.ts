import 'fake-indexeddb/auto'

import { deleteDB } from 'idb'
import { afterEach, describe, expect, it } from 'vitest'

import {
  AccountPreferencesRepository,
  BrowserAccountManager,
  IndexedDbAccountStorage,
  InMemoryAccountStorage,
  SessionOAuthIntentStore,
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

const openDatabases: Array<{ name: string; storage: IndexedDbAccountStorage }> = []

afterEach(async () => {
  for (const { name, storage } of openDatabases.splice(0)) {
    await storage.close()
    await deleteDB(name)
  }
})

describe('account storage', () => {
  it('keeps preferences isolated by account and media type in IndexedDB', async () => {
    const name = `accounts-test-${crypto.randomUUID()}`
    const storage = new IndexedDbAccountStorage(name)
    openDatabases.push({ name, storage })
    const preferences = new AccountPreferencesRepository(storage)
    const anime = {
      filters: { search: 'Gundam' },
      viewMode: 'grid' as const,
      pageSize: 100 as const,
    }
    const manga = {
      filters: { search: 'Berserk' },
      viewMode: 'list' as const,
      pageSize: 50 as const,
    }
    await storage.putAccount({
      id: 10,
      name: 'First',
      avatarUrl: null,
      accessToken: 'first-secret',
      tokenExpiresAt: 10_000,
      linkedAt: 1,
      lastUsedAt: 1,
      state: 'ready',
    })
    await storage.putAccount({
      id: 11,
      name: 'Second',
      avatarUrl: null,
      accessToken: 'second-secret',
      tokenExpiresAt: 10_000,
      linkedAt: 1,
      lastUsedAt: 1,
      state: 'ready',
    })

    await preferences.set(10, 'ANIME', anime)
    await preferences.set(10, 'MANGA', manga)
    await preferences.set(11, 'ANIME', { ...anime, pageSize: 250 })

    expect(await preferences.get(10, 'ANIME')).toEqual(anime)
    expect(await preferences.get(10, 'MANGA')).toEqual(manga)
    expect((await preferences.get(11, 'ANIME'))?.pageSize).toBe(250)
  })

  it('removes preferences with an account', async () => {
    const name = `accounts-delete-test-${crypto.randomUUID()}`
    const storage = new IndexedDbAccountStorage(name)
    openDatabases.push({ name, storage })
    await storage.putAccount({
      id: 10,
      name: 'Ari',
      avatarUrl: null,
      accessToken: 'secret',
      tokenExpiresAt: 10_000,
      linkedAt: 1,
      lastUsedAt: 1,
      state: 'ready',
    })
    await storage.putPreferences(10, 'ANIME', {
      filters: {},
      viewMode: 'grid',
      pageSize: 100,
    })

    await storage.deleteAccount(10)

    expect(await storage.getAccount(10)).toBeUndefined()
    expect(await storage.getPreferences(10, 'ANIME')).toBeUndefined()
  })

  it('clears all account and preference records', async () => {
    const name = `accounts-clear-test-${crypto.randomUUID()}`
    const storage = new IndexedDbAccountStorage(name)
    openDatabases.push({ name, storage })
    await storage.bootstrap()
    await storage.putAccount({
      id: 10,
      name: 'Ari',
      avatarUrl: null,
      accessToken: 'secret',
      tokenExpiresAt: 10_000,
      linkedAt: 1,
      lastUsedAt: 1,
      state: 'ready',
    })
    await storage.putPreferences(10, 'MANGA', {
      filters: {},
      viewMode: 'list',
      pageSize: 50,
    })

    await storage.clearAll()

    expect(await storage.listAccounts()).toEqual([])
    expect(await storage.getPreferences(10, 'MANGA')).toBeUndefined()
    await storage.close()
  })

  it('does not recreate IndexedDB preferences when a delayed write settles after removal', async () => {
    const name = `accounts-race-test-${crypto.randomUUID()}`
    const storage = new IndexedDbAccountStorage(name)
    openDatabases.push({ name, storage })
    await storage.putAccount({
      id: 10,
      name: 'Before removal',
      avatarUrl: null,
      accessToken: 'first-secret',
      tokenExpiresAt: 10_000,
      linkedAt: 1,
      lastUsedAt: 1,
      state: 'ready',
    })

    await storage.deleteAccount(10)
    await storage.putPreferences(10, 'ANIME', {
      filters: { search: 'late write' },
      viewMode: 'list',
      pageSize: 50,
    })
    await storage.putAccount({
      id: 10,
      name: 'Relinked',
      avatarUrl: null,
      accessToken: 'second-secret',
      tokenExpiresAt: 20_000,
      linkedAt: 2,
      lastUsedAt: 2,
      state: 'ready',
    })

    expect(await storage.getPreferences(10, 'ANIME')).toBeUndefined()
  })

  it('keeps the in-memory adapter consistent when a delayed write follows removal', async () => {
    const storage = new InMemoryAccountStorage()
    await storage.putAccount({
      id: 10,
      name: 'Before removal',
      avatarUrl: null,
      accessToken: 'first-secret',
      tokenExpiresAt: 10_000,
      linkedAt: 1,
      lastUsedAt: 1,
      state: 'ready',
    })

    await storage.deleteAccount(10)
    await storage.putPreferences(10, 'MANGA', {
      filters: { search: 'late write' },
      viewMode: 'grid',
      pageSize: 100,
    })
    await storage.putAccount({
      id: 10,
      name: 'Relinked',
      avatarUrl: null,
      accessToken: 'second-secret',
      tokenExpiresAt: 20_000,
      linkedAt: 2,
      lastUsedAt: 2,
      state: 'ready',
    })

    expect(await storage.getPreferences(10, 'MANGA')).toBeUndefined()
  })
})

describe('credential expiry', () => {
  it('retains the summary but deletes an expired token on bootstrap', async () => {
    const storage = new InMemoryAccountStorage()
    await storage.putAccount({
      id: 7,
      name: 'Expired',
      avatarUrl: null,
      accessToken: 'expired-secret',
      tokenExpiresAt: 99,
      linkedAt: 1,
      lastUsedAt: 2,
      state: 'ready',
    })
    const manager = new BrowserAccountManager({
      storage,
      oauthIntentStore: new SessionOAuthIntentStore(new MemoryWebStorage()),
      viewerGateway: { getViewer: async () => ({ id: 7, name: 'Expired', avatarUrl: null }) },
      clientId: '1',
      navigate: () => undefined,
      now: () => 100,
    })

    await manager.bootstrap()

    expect(manager.getActiveAccount()).toMatchObject({
      id: 7,
      state: 'reauth-required',
    })
    expect(await storage.getAccount(7)).not.toHaveProperty('accessToken')
    await expect(
      manager.withAccessToken(7, async () => 'never'),
    ).rejects.toMatchObject({ code: 'reauth-required' })
  })
})
