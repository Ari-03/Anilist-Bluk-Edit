import { describe, expect, it, vi } from 'vitest'

import {
  BrowserAccountManager,
  InMemoryAccountStorage,
  SessionOAuthIntentStore,
  type AccountManagerDependencies,
  type AccountViewerGateway,
  type StorageLike,
  type ViewerIdentity,
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

const NOW = 2_000_000

async function setup(
  overrides: Partial<AccountManagerDependencies> = {},
  viewers: Record<string, ViewerIdentity> = {
    first: { id: 1, name: 'Ari', avatarUrl: 'https://img.example/ari.png' },
  },
) {
  const storage = new InMemoryAccountStorage()
  const sessionStorage = new MemoryWebStorage()
  const navigate = vi.fn()
  const viewerGateway: AccountViewerGateway = {
    getViewer: vi.fn(async (token) => {
      const viewer = viewers[token]
      if (!viewer) throw new Error('invalid token')
      return viewer
    }),
  }
  const manager = new BrowserAccountManager({
    storage,
    viewerGateway,
    oauthIntentStore: new SessionOAuthIntentStore(sessionStorage),
    clientId: '1234',
    navigate,
    now: () => NOW,
    createState: () => 'secure-state',
    ...overrides,
  })
  await manager.bootstrap()
  return { manager, navigate, sessionStorage, storage, viewerGateway }
}

async function linkFirst(manager: BrowserAccountManager, token = 'first') {
  manager.beginOAuthLink('/workspace?type=ANIME')
  return manager.completeOAuthLink(
    `#access_token=${token}&expires_in=3600&state=secure-state`,
  )
}

describe('BrowserAccountManager', () => {
  it('links a Viewer without exposing its token in account summaries', async () => {
    const { manager, navigate } = await setup()

    const account = await linkFirst(manager)

    expect(navigate).toHaveBeenCalledOnce()
    const authorizationUrl = new URL(navigate.mock.calls[0]![0] as string)
    expect(authorizationUrl.origin).toBe('https://anilist.co')
    expect(authorizationUrl.searchParams.get('client_id')).toBe('1234')
    expect(authorizationUrl.searchParams.get('state')).toBe('secure-state')
    expect(account).toEqual({
      id: 1,
      name: 'Ari',
      avatarUrl: 'https://img.example/ari.png',
      tokenExpiresAt: NOW + 3_600_000,
      linkedAt: NOW,
      lastUsedAt: NOW,
      state: 'ready',
    })
    expect(manager.listAccounts()[0]).not.toHaveProperty('accessToken')
    await expect(
      manager.withAccessToken(1, async (token) => token),
    ).resolves.toBe('first')
  })

  it('consumes and rejects an OAuth intent when state does not match', async () => {
    const { manager, viewerGateway } = await setup()
    manager.beginOAuthLink()

    await expect(
      manager.completeOAuthLink('#access_token=first&state=attacker-state'),
    ).rejects.toMatchObject({ code: 'oauth-state-mismatch' })
    expect(viewerGateway.getViewer).not.toHaveBeenCalled()

    await expect(
      manager.completeOAuthLink('#access_token=first&state=secure-state'),
    ).rejects.toMatchObject({ code: 'oauth-intent-missing' })
  })

  it('requires confirmation before replacing a duplicate Viewer token', async () => {
    const confirmReplacement = vi.fn(() => false)
    const { manager } = await setup({ confirmReplacement })
    await linkFirst(manager)

    manager.beginOAuthLink()
    await expect(
      manager.completeOAuthLink(
        '#access_token=first&expires_in=7200&state=secure-state',
      ),
    ).rejects.toMatchObject({ code: 'replacement-declined' })
    expect(confirmReplacement).toHaveBeenCalledOnce()
  })

  it('switches accounts and removes account-scoped state through one cleanup seam', async () => {
    const onAccountRemoved = vi.fn()
    const viewers = {
      first: { id: 1, name: 'Ari', avatarUrl: null },
      second: { id: 2, name: 'Mina', avatarUrl: null },
    }
    const { manager, storage } = await setup(
      { onAccountRemoved },
      viewers,
    )
    await manager.importLegacyToken('first')
    await manager.importLegacyToken('second')
    await storage.putPreferences(2, 'ANIME', {
      filters: { search: 'season' },
      viewMode: 'grid',
      pageSize: 100,
    })

    await manager.activate(1)
    expect(manager.getActiveAccount()?.id).toBe(1)
    await manager.remove(1)
    expect(onAccountRemoved).toHaveBeenCalledWith(1)
    expect(manager.getActiveAccount()?.id).toBe(2)

    await manager.remove(2)
    expect(await storage.getPreferences(2, 'ANIME')).toBeUndefined()
    expect(manager.getActiveAccount()).toBeNull()
  })

  it('forgets all linked accounts and invokes application cleanup once', async () => {
    const onForgetAll = vi.fn()
    const { manager } = await setup({ onForgetAll })
    await manager.importLegacyToken('first')

    await manager.forgetAll()

    expect(manager.listAccounts()).toEqual([])
    expect(onForgetAll).toHaveBeenCalledOnce()
  })
})
