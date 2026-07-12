import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import type { RelatedSeasonDiscovery } from '@/modules/anilist'
import type { BulkJobOutcome, BulkJobProgress } from '@/modules/bulk-edit'

import {
  RelatedSeasonsDialog,
  type RelatedSeasonsDialogProps,
} from './RelatedSeasonsDialog'

beforeAll(() => {
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

const stats = {
  totalRequests: 3,
  successfulRequests: 2,
  failedRequests: 1,
  retriedRequests: 0,
  rateLimitHits: 0,
  averageResponseTime: 100,
  currentQueueSize: 0,
  limitPerMinute: 30,
  remaining: 27,
  resetAt: null,
}

const discovery: RelatedSeasonDiscovery = {
  seed: {
    id: 1,
    title: { userPreferred: 'Blue Beginning' },
    type: 'ANIME',
    format: 'TV',
    startDate: { year: 2023, month: 1, day: 8 },
    seasonYear: 2023,
    episodes: 12,
    genres: ['Drama'],
    mediaListEntry: { entryId: 101, status: 'COMPLETED', progress: 12 },
    relations: [
      { relationType: 'SEQUEL', mediaId: 2, mediaType: 'ANIME' },
    ],
  },
  nodes: [
    {
      id: 2,
      title: { userPreferred: 'Blue Season Two' },
      mediaType: 'ANIME',
      format: 'TV_SHORT',
      releaseDate: { year: 2024, month: 4, day: 2 },
      seasonYear: 2024,
      genres: ['Drama'],
      depth: 1,
      existingListEntry: null,
      proposedAction: { status: 'COMPLETED', progress: 12 },
      selectedByDefault: true,
      connections: [
        { relationType: 'PREQUEL', mediaId: 1, mediaType: 'ANIME' },
        { relationType: 'SEQUEL', mediaId: 3, mediaType: 'ANIME' },
      ],
    },
    {
      id: 3,
      title: { english: 'Blue Finale' },
      mediaType: 'ANIME',
      format: 'MOVIE',
      releaseDate: { year: 2026 },
      seasonYear: 2026,
      genres: ['Drama'],
      depth: 2,
      existingListEntry: { entryId: 103, status: 'CURRENT', progress: 2 },
      proposedAction: { status: 'COMPLETED' },
      selectedByDefault: false,
      connections: [
        { relationType: 'PREQUEL', mediaId: 2, mediaType: 'ANIME' },
      ],
    },
  ],
  visitedCount: 3,
  truncated: false,
}

function defaultProps(
  overrides: Partial<RelatedSeasonsDialogProps> = {},
): RelatedSeasonsDialogProps {
  return {
    open: true,
    accountName: 'Ari',
    seedTitle: 'Blue Beginning',
    loading: false,
    error: null,
    discovery,
    selectedMediaIds: new Set([2]),
    onToggle: vi.fn(),
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    onClose: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  }
}

describe('RelatedSeasonsDialog', () => {
  it('previews relation cues and keeps existing entries opt-in', async () => {
    const user = userEvent.setup()
    const props = defaultProps()
    render(<RelatedSeasonsDialog {...props} />)

    expect(
      screen.getByRole('dialog', { name: 'Find related seasons' }),
    ).toHaveAccessibleDescription(
      'Review prequels and sequels related to Blue Beginning for Ari.',
    )

    const missing = screen.getByRole('checkbox', {
      name: 'Include Blue Season Two',
    })
    const existing = screen.getByRole('checkbox', {
      name: 'Update existing Blue Finale',
    })
    expect(missing).toBeChecked()
    expect(existing).not.toBeChecked()

    const secondSeason = screen.getByRole('listitem', {
      name: 'Blue Season Two',
    })
    expect(secondSeason).toHaveTextContent('TV SHORT')
    expect(secondSeason).toHaveTextContent('1 connection from the seed')
    expect(secondSeason).toHaveTextContent('Prequel: Blue Beginning')
    expect(secondSeason).toHaveTextContent('Sequel: Blue Finale')
    expect(within(secondSeason).getByText('Apr 2, 2024')).toHaveAttribute(
      'datetime',
      '2024-04-02',
    )
    expect(secondSeason).toHaveTextContent(
      'Add as Completed with progress 12',
    )

    const finale = screen.getByRole('listitem', { name: 'Blue Finale' })
    expect(finale).toHaveTextContent('Already on your list as Current')
    expect(finale).toHaveTextContent('No change')
    expect(finale).toHaveTextContent('Progress will remain unspecified')

    await user.click(existing)
    expect(props.onToggle).toHaveBeenCalledWith(3)

    await user.click(
      screen.getByRole('button', {
        name: 'Confirm 1 related season for Ari',
      }),
    )
    expect(props.onConfirm).toHaveBeenCalledWith([2])
    expect(screen.getByText('Exactly 1 related season will be changed in Ari.')).toBeInTheDocument()
  })

  it('shows a cancellable loading state and an actionable discovery error', async () => {
    const user = userEvent.setup()
    const loadingProps = defaultProps({
      loading: true,
      discovery: null,
      selectedMediaIds: new Set(),
    })
    const { rerender } = render(<RelatedSeasonsDialog {...loadingProps} />)

    expect(screen.getByRole('status')).toHaveTextContent(
      'Finding prequels and sequels for Blue Beginning',
    )
    await user.click(screen.getByRole('button', { name: 'Close preview' }))
    expect(loadingProps.onClose).toHaveBeenCalledOnce()

    const errorProps = defaultProps({
      loading: false,
      error: 'AniList is temporarily unavailable.',
      discovery: null,
      selectedMediaIds: new Set(),
    })
    rerender(<RelatedSeasonsDialog {...errorProps} />)

    expect(screen.getByRole('alert')).toHaveTextContent(
      'AniList is temporarily unavailable.',
    )
    await user.click(screen.getByRole('button', { name: 'Retry related-season search' }))
    expect(errorProps.onRetry).toHaveBeenCalledOnce()
  })

  it('explains cycle handling and a bounded, truncated traversal', () => {
    render(
      <RelatedSeasonsDialog
        {...defaultProps({
          discovery: { ...discovery, visitedCount: 100, truncated: true },
        })}
      />,
    )

    expect(screen.getByText(/Cycles and duplicate paths are collapsed/)).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent(
      'Search stopped after visiting 100 media',
    )
  })

  it('reports semantic job progress, blocks dismissal, and cancels explicitly', async () => {
    const user = userEvent.setup()
    const progress: BulkJobProgress = {
      phase: 'mutating',
      total: 2,
      attempted: 1,
      confirmed: 1,
      failed: 0,
      unattempted: 1,
      stats,
    }
    const props = defaultProps({ running: true, progress })
    render(<RelatedSeasonsDialog {...props} />)

    expect(
      screen.getByRole('progressbar', { name: 'Related-season update progress' }),
    ).toHaveAttribute('aria-valuenow', '1')
    expect(screen.getByRole('status')).toHaveTextContent(
      'Updating related seasons: 1 confirmed and 1 waiting.',
    )
    expect(screen.getAllByRole('checkbox')[0]).toBeDisabled()

    fireEvent(
      screen.getByRole('dialog'),
      new Event('cancel', { cancelable: true }),
    )
    expect(props.onClose).not.toHaveBeenCalled()

    await user.click(
      screen.getByRole('button', { name: 'Cancel related-season job' }),
    )
    expect(props.onCancel).toHaveBeenCalledOnce()
  })

  it('keeps a partial result visible and offers retry for the remainder', async () => {
    const user = userEvent.setup()
    const outcome: BulkJobOutcome = {
      status: 'partial',
      confirmedPatches: [],
      confirmedCreatedEntries: [
        {
          entryId: 102,
          mediaId: 2,
          mediaType: 'ANIME',
          values: { status: 'COMPLETED' },
        },
      ],
      confirmedDeletedIds: [],
      failures: [],
      creationFailures: [
        {
          mediaId: 3,
          kind: 'network',
          message: 'Network unavailable.',
          retryable: true,
        },
      ],
      unattemptedIds: [],
      unattemptedMediaIds: [],
      stats,
    }
    const props = defaultProps({ outcome })
    render(<RelatedSeasonsDialog {...props} />)

    expect(screen.getByRole('status')).toHaveTextContent(
      '1 related season confirmed. 1 remains.',
    )
    const pendingSelection = screen.getByRole('checkbox', {
      name: 'Include Blue Season Two',
    })
    expect(pendingSelection).toBeDisabled()
    await user.click(pendingSelection)
    expect(props.onToggle).not.toHaveBeenCalled()
    await user.click(
      screen.getByRole('button', { name: 'Retry 1 remaining related season' }),
    )
    expect(props.onRetry).toHaveBeenCalledOnce()
    expect(
      screen.queryByRole('button', { name: /Confirm/ }),
    ).not.toBeInTheDocument()
  })

  it('announces action failures inside the modal dialog', () => {
    render(
      <RelatedSeasonsDialog
        {...defaultProps({ actionError: 'Targeted verification is offline.' })}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Targeted verification is offline.',
    )
  })

  it('cannot clear an ambiguous outcome by toggling the preview selection', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const ambiguousOutcome: BulkJobOutcome = {
      status: 'unknown',
      confirmedPatches: [],
      confirmedCreatedEntries: [],
      confirmedDeletedIds: [],
      failures: [],
      creationFailures: [
        {
          mediaId: 2,
          kind: 'unknown',
          message: 'The creation result is uncertain.',
          retryable: false,
        },
      ],
      unattemptedIds: [],
      unattemptedMediaIds: [],
      stats,
    }

    function OutcomeHarness() {
      const [outcome, setOutcome] = useState<BulkJobOutcome | null>(
        ambiguousOutcome,
      )
      const [selected, setSelected] = useState<ReadonlySet<number>>(
        new Set([2]),
      )
      return (
        <RelatedSeasonsDialog
          {...defaultProps({
            outcome,
            selectedMediaIds: selected,
            onClose,
            onToggle: (mediaId) => {
              setOutcome(null)
              setSelected((current) => {
                const next = new Set(current)
                if (next.has(mediaId)) next.delete(mediaId)
                else next.add(mediaId)
                return next
              })
            },
          })}
        />
      )
    }

    render(<OutcomeHarness />)

    const uncertain = screen.getByRole('checkbox', {
      name: 'Include Blue Season Two',
    })
    expect(uncertain).toBeDisabled()
    await user.click(uncertain)

    expect(
      screen.getByRole('button', {
        name: 'Verify 1 uncertain related season',
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Confirm/ }),
    ).not.toBeInTheDocument()

    expect(
      screen.queryByRole('button', { name: 'Close preview' }),
    ).not.toBeInTheDocument()
    const dialog = screen.getByRole('dialog', { name: 'Find related seasons' })
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    fireEvent.click(dialog)
    const lockedClose = screen.getByRole('button', {
      name: 'Uncertain results require verification before closing',
    })
    expect(lockedClose).toBeDisabled()
    await user.click(lockedClose)
    expect(onClose).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', {
        name: 'Verify 1 uncertain related season',
      }),
    ).toBeInTheDocument()
  })

  it('renders an empty successful discovery separately from loading and error', () => {
    render(
      <RelatedSeasonsDialog
        {...defaultProps({
          discovery: { ...discovery, nodes: [], visitedCount: 1 },
          selectedMediaIds: new Set(),
        })}
      />,
    )

    expect(screen.getByText('No related seasons found')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})
