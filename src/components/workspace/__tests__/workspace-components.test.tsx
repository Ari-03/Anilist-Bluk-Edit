import { createElement, type ComponentProps, type ReactNode } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { createDefaultListQuery } from '@/modules/media-list'
import {
  MediaFormat,
  MediaListStatus,
  MediaType as AniListMediaType,
  type MediaList,
} from '@/types/anilist'

import { FilterRail } from '../FilterRail'
import { MediaCard } from '../MediaCard'
import { MediaListView } from '../MediaListView'
import { MediaWorkspaceView } from '../MediaWorkspaceView'

vi.mock('next/image', () => ({
  default: (
    props: ComponentProps<'img'> & { fill?: boolean; priority?: boolean },
  ) => {
    // The behavior under test is fallback and accessible naming, not Next's loader.
    const imageProps = Object.fromEntries(
      Object.entries(props).filter(
        ([name]) => name !== 'fill' && name !== 'priority',
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
    article: (props: ComponentProps<'article'> & Record<string, unknown>) => {
      const motionProps = new Set([
        'children',
        'layout',
        'layoutDependency',
        'initial',
        'animate',
        'exit',
        'transition',
      ])
      const articleProps = Object.fromEntries(
        Object.entries(props).filter(([name]) => !motionProps.has(name)),
      ) as ComponentProps<'article'>
      return createElement('article', articleProps, props.children as ReactNode)
    },
    div: (props: ComponentProps<'div'> & Record<string, unknown>) => {
      const motionProps = new Set([
        'children',
        'layout',
        'layoutDependency',
        'initial',
        'animate',
        'exit',
        'transition',
      ])
      const divProps = Object.fromEntries(
        Object.entries(props).filter(([name]) => !motionProps.has(name)),
      ) as ComponentProps<'div'>
      return createElement('div', divProps, props.children as ReactNode)
    },
  },
}))

function entry(id: number, title: string): MediaList {
  return {
    id,
    userId: 7,
    mediaId: id + 100,
    status: MediaListStatus.CURRENT,
    score: 8,
    progress: 4,
    media: {
      id: id + 100,
      title: { userPreferred: title },
      type: AniListMediaType.ANIME,
      format: MediaFormat.TV,
      episodes: 12,
      genres: ['Drama'],
      countryOfOrigin: 'JP',
    },
  }
}

describe('FilterRail', () => {
  it('keeps status and custom-list filters separate and accepts zero', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const query = createDefaultListQuery()

    const { rerender } = render(
      <FilterRail
        query={query}
        onChange={onChange}
        options={{
          customLists: ['Weekend'],
          formats: [MediaFormat.TV],
          genres: ['Drama'],
          countries: ['JP'],
        }}
      />,
    )

    await user.click(screen.getByRole('checkbox', { name: 'Watching' }))
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        statuses: [MediaListStatus.CURRENT],
        customLists: [],
      }),
    )

    rerender(
      <FilterRail
        query={{ ...query, statuses: [MediaListStatus.CURRENT] }}
        onChange={onChange}
        options={{
          customLists: ['Weekend'],
          formats: [],
          genres: [],
          countries: [],
        }}
      />,
    )
    await user.click(screen.getByRole('checkbox', { name: 'Weekend' }))
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        statuses: [MediaListStatus.CURRENT],
        customLists: ['Weekend'],
      }),
    )

    const minimumScore = screen.getByRole('spinbutton', { name: 'Score from' })
    await user.type(minimumScore, '0')
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ score: { min: 0 } }),
    )
  })
})

describe('MediaCard', () => {
  it('acts as a keyboard-operable checkbox and hides nested actions in bulk mode', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    const onEdit = vi.fn()

    render(
      <MediaCard
        entry={entry(1, 'Blue Period')}
        bulkMode
        selected={false}
        onToggle={onToggle}
        onEdit={onEdit}
      />,
    )

    const card = screen.getByRole('checkbox', { name: 'Select Blue Period' })
    expect(card).toHaveAttribute('aria-checked', 'false')
    expect(
      screen.queryByRole('button', { name: 'Edit Blue Period' }),
    ).not.toBeInTheDocument()

    card.focus()
    await user.keyboard('{Enter}')
    expect(onToggle).toHaveBeenCalledWith(1)
  })

  it('exposes labelled actions outside bulk mode', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    const onFindRelated = vi.fn()

    render(
      <MediaCard
        entry={entry(2, 'Frieren')}
        onEdit={onEdit}
        onDelete={onDelete}
        onFindRelated={onFindRelated}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Edit Frieren' }))
    await user.click(screen.getByRole('button', { name: 'Delete Frieren' }))
    await user.click(
      screen.getByRole('button', { name: 'Find related seasons for Frieren' }),
    )

    expect(onEdit).toHaveBeenCalledWith(2)
    expect(onDelete).toHaveBeenCalledWith(2)
    expect(onFindRelated).toHaveBeenCalledWith(2)
  })
})

describe('MediaListView', () => {
  it('keeps the motion owner mounted while the final visible card exits', async () => {
    const { rerender } = render(
      <MediaListView
        entries={[entry(1, 'Last visible entry')]}
        loadState={{ status: 'ready', loadedAt: 1 }}
        motionReady
      />,
    )

    await waitFor(() =>
      expect(document.querySelector('[data-motion-ready="true"]')).toBeTruthy(),
    )
    rerender(
      <MediaListView
        entries={[]}
        loadState={{ status: 'ready', loadedAt: 1 }}
        motionReady
      />,
    )

    expect(document.querySelector('[data-motion-ready="true"]')).toBeTruthy()
    expect(screen.getByText('No entries match these filters')).toBeVisible()
  })

  it('renders only the supplied page and exposes page-scoped selection', async () => {
    const user = userEvent.setup()
    const onSelectPage = vi.fn()
    const onSelectAllFiltered = vi.fn()
    const onPageChange = vi.fn()

    render(
      <MediaListView
        entries={[entry(1, 'First'), entry(2, 'Second')]}
        loadState={{ status: 'ready', loadedAt: 1 }}
        page={2}
        pageCount={3}
        totalEntries={202}
        bulkMode
        selectedIds={new Set()}
        onToggleSelection={vi.fn()}
        onSelectPage={onSelectPage}
        onSelectAllFiltered={onSelectAllFiltered}
        onPageChange={onPageChange}
      />,
    )

    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Select this page' }))
    await user.click(
      screen.getByRole('button', { name: 'Select all 202 filtered entries' }),
    )
    await user.click(screen.getByRole('button', { name: 'Next page' }))

    expect(onSelectPage).toHaveBeenCalledWith([1, 2])
    expect(onSelectAllFiltered).toHaveBeenCalledOnce()
    expect(onPageChange).toHaveBeenCalledWith(3)
  })

  it('distinguishes loading, empty, offline, and error states', () => {
    const { rerender } = render(
      <MediaListView entries={[]} loadState={{ status: 'loading' }} />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading your media list',
    )

    rerender(
      <MediaListView
        entries={[]}
        loadState={{ status: 'empty', loadedAt: 1 }}
      />,
    )
    expect(screen.getByText('Your media list is empty')).toBeInTheDocument()

    rerender(<MediaListView entries={[]} loadState={{ status: 'offline' }} />)
    expect(screen.getByText('You are offline')).toBeInTheDocument()

    rerender(
      <MediaListView
        entries={[]}
        loadState={{
          status: 'error',
          message: 'AniList is unavailable',
          retryable: true,
        }}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'AniList is unavailable',
    )
    expect(
      screen.queryByText('Your media list is empty'),
    ).not.toBeInTheDocument()
  })
})

describe('MediaWorkspaceView', () => {
  it('keeps media switching and mobile filters reachable', async () => {
    const user = userEvent.setup()
    const onMediaTypeChange = vi.fn()
    const query = createDefaultListQuery()

    render(
      <MediaWorkspaceView
        mediaType="ANIME"
        onMediaTypeChange={onMediaTypeChange}
        query={query}
        onQueryChange={vi.fn()}
        filterOptions={{
          customLists: [],
          formats: [],
          genres: [],
          countries: [],
        }}
        projection={{ entries: [], totalEntries: 0, page: 1, pageCount: 1 }}
        loadState={{ status: 'empty', loadedAt: 1 }}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Show manga list' }))
    expect(onMediaTypeChange).toHaveBeenCalledWith('MANGA')

    const openFilters = screen.getByRole('button', {
      name: 'Open filters and sorting',
    })
    await user.click(openFilters)
    const dialog = screen.getByRole('dialog', { name: 'Filters and sorting' })
    expect(dialog).toBeInTheDocument()
    expect(
      within(dialog).getByRole('searchbox', { name: 'Search titles' }),
    ).toBeInTheDocument()

    await user.click(
      within(dialog).getByRole('button', {
        name: 'Close filters and sorting',
      }),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(openFilters).toHaveFocus())
  })
})
