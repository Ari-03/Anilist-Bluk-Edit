import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  AniListAccountViewerGateway,
  OAUTH_INTENT_STORAGE_KEY,
  createBrowserAccountManager,
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

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('browser account-manager factory', () => {
  it('wires IndexedDB, session OAuth intent storage, and browser navigation', async () => {
    const sessionStorage = new MemoryWebStorage()
    const assign = vi.fn()
    vi.stubGlobal('window', {
      sessionStorage,
      location: { assign },
    })
    const manager = createBrowserAccountManager({
      databaseName: `account-factory-${crypto.randomUUID()}`,
      clientId: 'configured-client',
      viewerGateway: {
        getViewer: async () => ({
          id: 17,
          name: 'Linked viewer',
          avatarUrl: null,
        }),
      },
      now: () => 1_000,
      createState: () => 'browser-state',
    })
    await manager.bootstrap()

    manager.beginOAuthLink('/workspace')

    const authorizationUrl = new URL(assign.mock.calls[0]![0] as string)
    expect(authorizationUrl.origin).toBe('https://anilist.co')
    expect(authorizationUrl.searchParams.get('state')).toBe('browser-state')
    expect(
      JSON.parse(sessionStorage.getItem(OAUTH_INTENT_STORAGE_KEY) ?? '{}'),
    ).toEqual({
      state: 'browser-state',
      returnTo: '/workspace',
      createdAt: 1_000,
    })

    const linked = await manager.completeOAuthLink(
      '#access_token=factory-credential&expires_in=60&state=browser-state',
    )
    expect(linked).toMatchObject({
      id: 17,
      name: 'Linked viewer',
      state: 'ready',
      tokenExpiresAt: 61_000,
    })
    expect(manager.getActiveAccount()).toEqual(linked)
    expect(sessionStorage.getItem(OAUTH_INTENT_STORAGE_KEY)).toBeNull()
  })

  it('validates Viewer identity through the direct AniList adapter', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            Viewer: {
              id: 17,
              name: 'Linked viewer',
              avatar: { large: null, medium: 'https://s4.anilist.co/avatar.png' },
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    const gateway = new AniListAccountViewerGateway(fetcher)

    await expect(gateway.getViewer('private-token')).resolves.toEqual({
      id: 17,
      name: 'Linked viewer',
      avatarUrl: 'https://s4.anilist.co/avatar.png',
    })
    expect(fetcher).toHaveBeenCalledWith(
      'https://graphql.anilist.co',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer private-token',
        }),
      }),
    )
  })

  it('rejects unreadable and invalid Viewer responses', async () => {
    const unreadable = new AniListAccountViewerGateway(
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response('not-json', { status: 502 }),
      ),
    )
    await expect(unreadable.getViewer('token')).rejects.toThrow(
      'unreadable Viewer response',
    )

    const invalid = new AniListAccountViewerGateway(
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ data: { Viewer: null } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    await expect(invalid.getViewer('token')).rejects.toThrow(
      'did not accept this account token',
    )
  })
})
