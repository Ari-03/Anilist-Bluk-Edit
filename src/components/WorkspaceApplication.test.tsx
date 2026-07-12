import {
  createElement,
  type ComponentProps,
  type ReactNode,
} from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/contexts/AppContext', () => ({ useApp: vi.fn() }))
vi.mock('next/image', () => ({
  default: (
    props: ComponentProps<'img'> & {
      fill?: boolean
      priority?: boolean
      unoptimized?: boolean
    },
  ) => {
    const imageProps = Object.fromEntries(
      Object.entries(props).filter(
        ([name]) =>
          name !== 'fill' && name !== 'priority' && name !== 'unoptimized',
      ),
    ) as ComponentProps<'img'>
    return createElement('img', imageProps)
  },
}))
vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  LayoutGroup: ({ children }: { children: ReactNode }) => children,
  LazyMotion: ({ children }: { children: ReactNode }) => children,
  MotionConfig: ({ children }: { children: ReactNode }) => children,
  domMax: {},
  m: {
    div: ({ children, ...props }: ComponentProps<'div'> & Record<string, unknown>) => {
      const motionNames = new Set([
        'layout',
        'layoutDependency',
        'initial',
        'animate',
        'exit',
        'transition',
      ])
      const elementProps = Object.fromEntries(
        Object.entries(props).filter(([name]) => !motionNames.has(name)),
      ) as ComponentProps<'div'>
      return createElement('div', elementProps, children)
    },
  },
}))

import { useApp } from '@/contexts/AppContext'
import { notificationActions } from '@/components/ui'
import type {
  AniListGateway,
  GatewayBatchOutcome,
  MediaListCollectionEntry,
  RateLimitStats,
} from '@/modules/anilist'
import { createMediaListWorkspace } from '@/modules/media-list'

import { WorkspaceApplication } from './WorkspaceApplication'

const account = {
  id: 7,
  name: 'Coverage account',
  avatarUrl: null,
  tokenExpiresAt: Date.now() + 86_400_000,
  linkedAt: 1,
  lastUsedAt: 2,
  state: 'ready' as const,
}

const entry: MediaListCollectionEntry = {
  id: 11,
  userId: 7,
  mediaId: 101,
  status: 'CURRENT',
  score: 7,
  progress: 2,
  private: false,
  hiddenFromStatusLists: false,
  notes: '',
  customLists: { Favorites: true },
  updatedAt: 1,
  media: {
    id: 101,
    title: { userPreferred: 'Blue coverage show' },
    type: 'ANIME',
    format: 'TV',
    startDate: { year: 2024, month: 1, day: 1 },
    seasonYear: 2024,
    episodes: 12,
    countryOfOrigin: 'JP',
    genres: ['Drama'],
    coverImage: { color: '#0369a1' },
  },
}

const stats: RateLimitStats = {
  totalRequests: 1,
  successfulRequests: 1,
  failedRequests: 0,
  retriedRequests: 0,
  rateLimitHits: 0,
  averageResponseTime: 1,
  currentQueueSize: 0,
  limitPerMinute: 30,
  remaining: 29,
  resetAt: null,
}

const emptyBatch = (): GatewayBatchOutcome => ({
  confirmed: [],
  confirmedDeletedIds: [],
  failures: [],
  unconfirmedIds: [],
  unattemptedIds: [],
})

function createGateway(
  collection: readonly MediaListCollectionEntry[] = [entry],
): AniListGateway {
  return {
    loadMediaListCollection: vi.fn(async ({ mediaType }) =>
      mediaType === 'ANIME' ? collection : [],
    ),
    getMediaListOptionsCatalog: vi.fn(async () => ({
      animeCustomLists: ['Favorites'],
      mangaCustomLists: ['Reading'],
    })),
    readMediaRelations: vi.fn(async () => []),
    discoverRelatedSeasons: vi.fn<AniListGateway['discoverRelatedSeasons']>(async () => ({
      seed: {
        id: 101,
        title: { userPreferred: 'Blue coverage show' },
        type: 'ANIME' as const,
        format: 'TV',
        episodes: 12,
        genres: ['Drama'],
        mediaListEntry: { entryId: 11, status: 'COMPLETED' as const },
        relations: [{ relationType: 'SEQUEL', mediaId: 102, mediaType: 'ANIME' }],
      },
      nodes: [
        {
          id: 102,
          title: { userPreferred: 'Green coverage sequel' },
          mediaType: 'ANIME' as const,
          format: 'TV',
          releaseDate: { year: 2025, month: 1, day: 1 },
          seasonYear: 2025,
          countryOfOrigin: 'JP',
          genres: ['Drama'],
          coverImage: { large: 'https://s4.anilist.co/green.jpg', color: '#15803d' },
          depth: 1,
          existingListEntry: null,
          proposedAction: { status: 'COMPLETED' as const, progress: 12 },
          selectedByDefault: true,
          connections: [
            { relationType: 'SEQUEL', mediaId: 101, mediaType: 'ANIME' as const },
          ],
        },
      ],
      visitedCount: 2,
      truncated: false,
    })),
    readEntries: vi.fn(async () => ({
      entries: [],
      missingIds: [],
      failures: [],
      unconfirmedIds: [],
      unattemptedIds: [],
    })),
    readEntriesByMediaIds: vi.fn(async () => ({
      entries: [],
      missingMediaIds: [],
      failures: [],
      unconfirmedMediaIds: [],
      unattemptedMediaIds: [],
    })),
    updateShared: vi.fn<AniListGateway['updateShared']>(async (request) => ({
      ...emptyBatch(),
      confirmed: request.entryIds.map((entryId) => ({
        entryId,
        values: request.values,
        updatedAt: 2,
      })),
    })),
    saveEntries: vi.fn(async () => emptyBatch()),
    createEntries: vi.fn<AniListGateway['createEntries']>(async (request) => ({
      confirmed: request.entries.map((created, index) => ({
        entryId: 2_000 + index,
        mediaId: created.mediaId,
        values: {
          status: created.status,
          ...(created.progress === undefined
            ? {}
            : { progress: created.progress }),
        },
        updatedAt: 3,
      })),
      failures: [],
      unconfirmedMediaIds: [],
      unattemptedMediaIds: [],
    })),
    deleteEntries: vi.fn(async (request) => ({
      ...emptyBatch(),
      confirmedDeletedIds: request.entryIds,
    })),
    getRateLimitStats: () => stats,
  }
}

function mockWorkspaceContext(
  gateway: AniListGateway,
  workspace: ReturnType<typeof createMediaListWorkspace>,
  setJobRunning = vi.fn(),
): typeof setJobRunning {
  vi.mocked(useApp).mockReturnValue({
    status: 'ready',
    startupError: null,
    aniListGateway: gateway,
    accounts: [account],
    activeAccount: account,
    workspace,
    preferences: null,
    legacyCandidate: null,
    jobRunning: false,
    darkMode: false,
    beginLink: vi.fn(),
    completeLink: vi.fn(async () => account),
    activate: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    forgetAll: vi.fn(async () => {}),
    importLegacy: vi.fn(async () => account),
    deleteLegacy: vi.fn(),
    markReauthenticationRequired: vi.fn(async () => {}),
    setJobRunning,
    toggleDarkMode: vi.fn(),
  } as unknown as ReturnType<typeof useApp>)
  return setJobRunning
}

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', (handle: number) =>
    window.clearTimeout(handle),
  )
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute('open', '')
    },
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute('open')
      this.dispatchEvent(new Event('close'))
    },
  })
})

describe('WorkspaceApplication composition', () => {
  beforeEach(() => {
    notificationActions.clear()
  })

  it('loads, reconciles an edit, creates a related season, and deletes locally', async () => {
    const user = userEvent.setup()
    const gateway = createGateway()
    const workspace = createMediaListWorkspace()
    const setJobRunning = mockWorkspaceContext(gateway, workspace)

    render(<WorkspaceApplication account={account} />)

    await screen.findByText('Blue coverage show')
    await waitFor(() =>
      expect(gateway.getMediaListOptionsCatalog).toHaveBeenCalledOnce(),
    )

    await user.click(screen.getByRole('button', { name: 'Bulk edit' }))
    await user.click(
      await screen.findByRole('checkbox', {
        name: 'Select Blue coverage show',
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Edit selected' }))
    await user.click(
      await screen.findByRole('checkbox', { name: 'Change status' }),
    )
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Status value' }),
      'COMPLETED',
    )
    await user.click(
      screen.getByRole('button', { name: 'Apply changes to 1 entry' }),
    )

    await waitFor(() => {
      const card = screen
        .getByRole('heading', { name: 'Blue coverage show' })
        .closest('article')
      expect(card).not.toBeNull()
      expect(within(card!).getByText('Completed', { exact: true })).toBeVisible()
    })
    expect(gateway.updateShared).toHaveBeenCalledOnce()
    expect(gateway.loadMediaListCollection).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('checkbox', { name: 'Drama' }))
    await user.click(screen.getByRole('checkbox', { name: 'JP' }))
    await user.click(
      screen.getByRole('button', {
        name: 'Find related seasons for Blue coverage show',
      }),
    )
    await user.click(
      await screen.findByRole('button', {
        name: 'Confirm 1 related season for Coverage account',
      }),
    )
    await screen.findByText('Green coverage sequel')
    expect(gateway.createEntries).toHaveBeenCalledOnce()
    expect(
      workspace
        .getCollection({ accountId: 7, mediaType: 'ANIME' })
        .entries.find(({ mediaId }) => mediaId === 102)?.media,
    ).toMatchObject({
      countryOfOrigin: 'JP',
      genres: ['Drama'],
      coverImage: { large: 'https://s4.anilist.co/green.jpg' },
    })

    await user.click(
      screen.getByRole('button', { name: 'Delete Blue coverage show' }),
    )
    await user.click(
      await screen.findByRole('button', {
        name: 'Confirm deletion of 1 entry',
      }),
    )
    await waitFor(() =>
      expect(screen.queryByText('Blue coverage show')).not.toBeInTheDocument(),
    )
    expect(gateway.deleteEntries).toHaveBeenCalledOnce()
    expect(setJobRunning).toHaveBeenCalledWith(true)
    expect(setJobRunning).toHaveBeenLastCalledWith(false)
  })

  it('keeps a locally clamped page after deleting the last entry and adding one', async () => {
    const user = userEvent.setup()
    const pagedEntries: MediaListCollectionEntry[] = [
      entry,
      ...Array.from({ length: 50 }, (_, index) => {
        const mediaId = 200 + index
        return {
          ...entry,
          id: 12 + index,
          mediaId,
          media: {
            ...entry.media,
            id: mediaId,
            title: {
              userPreferred: `Paged coverage ${String(index + 1).padStart(2, '0')}`,
            },
          },
        }
      }),
    ]
    const gateway = createGateway(pagedEntries)
    const workspace = createMediaListWorkspace()
    mockWorkspaceContext(gateway, workspace)

    render(<WorkspaceApplication account={account} />)

    await screen.findByText('Blue coverage show')
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Entries per page' }),
      '50',
    )
    await screen.findByText('Page 1 of 2')
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    await screen.findByText('Page 2 of 2')
    await screen.findByText('Paged coverage 50')

    await user.click(
      screen.getByRole('button', { name: 'Delete Paged coverage 50' }),
    )
    await user.click(
      await screen.findByRole('button', {
        name: 'Confirm deletion of 1 entry',
      }),
    )
    await waitFor(() =>
      expect(screen.queryByText('Page 2 of 2')).not.toBeInTheDocument(),
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Find related seasons for Blue coverage show',
      }),
    )
    await user.click(
      await screen.findByRole('button', {
        name: 'Confirm 1 related season for Coverage account',
      }),
    )

    await screen.findByText('Page 1 of 2')
    expect(screen.getByText('Blue coverage show')).toBeVisible()
    expect(screen.queryByText('Page 2 of 2')).not.toBeInTheDocument()
  })
})
