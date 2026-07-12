import { act, render, waitFor } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))

import { track } from '@vercel/analytics'
import { trackBulkJobOutcome } from '@/lib/privacy-analytics'
import { IndexedDbAccountStorage } from '@/modules/accounts'

import { AppProvider, useApp } from './AppContext'

type AppSnapshot = ReturnType<typeof useApp>

function ContextProbe({ onSnapshot }: { onSnapshot(value: AppSnapshot): void }) {
  const value = useApp()
  useEffect(() => onSnapshot(value), [onSnapshot, value])
  return <p>{value.legacyCandidate ? JSON.stringify(value.legacyCandidate) : 'none'}</p>
}

function mockNetwork() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === 'https://graphql.anilist.co') {
      const request = JSON.parse(String(init?.body)) as { query?: string }
      if (request.query?.includes('MediaListOptionsCatalog')) {
        return new Response(
          JSON.stringify({
            data: {
              Viewer: {
                mediaListOptions: {
                  animeList: { customLists: [] },
                  mangaList: { customLists: [] },
                },
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }

      return new Response(
        JSON.stringify({
          data: {
            Viewer: { id: 9, name: 'Legacy', avatar: null },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    return new Response(null, { status: 204 })
  })
}

describe('legacy migration context boundary', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory())
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({ matches: false })),
    })
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('exposes only a safe summary and imports through an explicit action', async () => {
    const fetcher = mockNetwork()
    const onSnapshot = vi.fn<(value: AppSnapshot) => void>()
    const snapshot = () => onSnapshot.mock.lastCall?.[0]
    vi.stubGlobal('fetch', fetcher)
    window.localStorage.setItem(
      'anilist-bulk-edit-store',
      JSON.stringify({ state: { accessToken: 'legacy-secret' } }),
    )

    render(
      <AppProvider>
        <ContextProbe onSnapshot={onSnapshot} />
      </AppProvider>,
    )

    await waitFor(() => expect(snapshot()?.status).toBe('ready'))
    const publicContext = snapshot()
    expect(publicContext).not.toHaveProperty('manager')
    expect(publicContext).not.toHaveProperty('withAccessToken')
    expect(publicContext?.aniListGateway).not.toHaveProperty('transport')
    expect(publicContext?.aniListGateway).not.toHaveProperty('readTransport')
    expect(publicContext?.aniListGateway).not.toHaveProperty('withAccessToken')
    expect(snapshot()?.legacyCandidate).toEqual({ source: 'zustand' })
    expect(snapshot()?.legacyCandidate).not.toHaveProperty('accessToken')
    expect(JSON.stringify(snapshot()?.legacyCandidate)).not.toContain('legacy-secret')

    await act(async () => {
      await snapshot()?.importLegacy()
    })

    expect(snapshot()?.legacyCandidate).toBeNull()
    expect(snapshot()?.activeAccount).toMatchObject({ id: 9, name: 'Legacy' })
    expect(window.localStorage.getItem('anilist-bulk-edit-store')).toBeNull()
    expect(fetcher).toHaveBeenCalledWith(
      'https://graphql.anilist.co',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer legacy-secret',
        }),
      }),
    )

    await expect(
      snapshot()?.aniListGateway?.getMediaListOptionsCatalog({ accountId: 9 }),
    ).resolves.toEqual({
      animeCustomLists: [],
      mangaCustomLists: [],
    })

    await act(async () => {
      await snapshot()?.markReauthenticationRequired(9)
    })
    expect(snapshot()?.activeAccount).toMatchObject({
      id: 9,
      state: 'reauth-required',
    })
  })

  it('deletes legacy credentials without validating or importing them', async () => {
    const fetcher = mockNetwork()
    const onSnapshot = vi.fn<(value: AppSnapshot) => void>()
    const snapshot = () => onSnapshot.mock.lastCall?.[0]
    vi.stubGlobal('fetch', fetcher)
    window.localStorage.setItem('anilist_access_token', 'delete-secret')
    window.localStorage.setItem('anilist_user_data', '{"id":9}')

    render(
      <AppProvider>
        <ContextProbe onSnapshot={onSnapshot} />
      </AppProvider>,
    )

    await waitFor(() => expect(snapshot()?.status).toBe('ready'))

    act(() => snapshot()?.deleteLegacy())

    expect(snapshot()?.legacyCandidate).toBeNull()
    expect(window.localStorage.getItem('anilist_access_token')).toBeNull()
    expect(window.localStorage.getItem('anilist_user_data')).toBeNull()
    expect(fetcher).not.toHaveBeenCalledWith(
      'https://graphql.anilist.co',
      expect.anything(),
    )
  })

  it('confines an imported token to IndexedDB and AniList authorization', async () => {
    const token = 'privacy-boundary-sentinel'
    const fetcher = mockNetwork()
    const onSnapshot = vi.fn<(value: AppSnapshot) => void>()
    const snapshot = () => onSnapshot.mock.lastCall?.[0]
    const consoleSpies = [
      vi.spyOn(console, 'debug').mockImplementation(() => {}),
      vi.spyOn(console, 'info').mockImplementation(() => {}),
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
    ]
    vi.mocked(track).mockClear()
    vi.stubGlobal('fetch', fetcher)
    window.localStorage.setItem(
      'anilist-bulk-edit-store',
      JSON.stringify({ state: { accessToken: token } }),
    )

    render(
      <AppProvider>
        <ContextProbe onSnapshot={onSnapshot} />
      </AppProvider>,
    )

    await waitFor(() => expect(snapshot()?.status).toBe('ready'))
    await act(async () => {
      await snapshot()?.importLegacy()
    })
    await snapshot()?.aniListGateway?.getMediaListOptionsCatalog({ accountId: 9 })
    await trackBulkJobOutcome({
      outcome: 'completed',
      durationMs: 500,
      selectedCount: 1,
      retryCount: 0,
    })
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        '/api/auth/signout',
        expect.anything(),
      ),
    )

    const storage = new IndexedDbAccountStorage()
    await storage.bootstrap()
    expect(await storage.getAccount(9)).toMatchObject({ accessToken: token })

    const calls = fetcher.mock.calls
    const ownOriginCalls = calls.filter(([input]) =>
      String(input).startsWith('/'),
    )
    expect(ownOriginCalls).not.toHaveLength(0)
    expect(JSON.stringify(ownOriginCalls)).not.toContain(token)

    const aniListCalls = calls.filter(
      ([input]) => String(input) === 'https://graphql.anilist.co',
    )
    expect(aniListCalls).not.toHaveLength(0)
    for (const [, init] of aniListCalls) {
      expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${token}`)
      expect(String(init?.body)).not.toContain(token)
    }

    const localValues = Array.from(
      { length: window.localStorage.length },
      (_, index) => window.localStorage.getItem(window.localStorage.key(index) ?? ''),
    )
    expect(JSON.stringify(localValues)).not.toContain(token)
    expect(document.cookie).not.toContain(token)
    expect(JSON.stringify(vi.mocked(track).mock.calls)).not.toContain(token)
    expect(
      consoleSpies.flatMap((spy) => spy.mock.calls).flat().map(String).join(' '),
    ).not.toContain(token)
  })
})
