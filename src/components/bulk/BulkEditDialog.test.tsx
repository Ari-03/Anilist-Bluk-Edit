import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import type { BulkJobOutcome, BulkJobProgress } from '@/modules/bulk-edit'

import { BulkEditDialog, type BulkEditDialogProps } from './BulkEditDialog'

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
  totalRequests: 2,
  successfulRequests: 1,
  failedRequests: 1,
  retriedRequests: 0,
  rateLimitHits: 0,
  averageResponseTime: 120,
  currentQueueSize: 0,
  limitPerMinute: 30,
  remaining: 28,
  resetAt: null,
}

function defaultProps(
  overrides: Partial<BulkEditDialogProps> = {},
): BulkEditDialogProps {
  return {
    open: true,
    accountName: 'Ari',
    selectedCount: 3,
    customListCatalog: {
      status: 'ready',
      names: ['Favorites', 'Catch-up'],
      lastSyncedAt: Date.UTC(2026, 6, 11, 12),
    },
    onSubmit: vi.fn(),
    onDelete: vi.fn(),
    onCancel: vi.fn(),
    onClose: vi.fn(),
    onRetryRemaining: vi.fn(),
    onRefreshCatalog: vi.fn(),
    ...overrides,
  }
}

describe('BulkEditDialog', () => {
  it('submits explicit zero values and a deliberately cleared note', async () => {
    const user = userEvent.setup()
    const props = defaultProps()
    render(<BulkEditDialog {...props} />)

    expect(
      screen.getByRole('dialog', { name: 'Edit 3 selected entries' }),
    ).toHaveAccessibleDescription('Changes will apply to Ari only.')

    await user.click(screen.getByRole('checkbox', { name: 'Change score' }))
    await user.clear(screen.getByRole('spinbutton', { name: 'Score value' }))
    await user.type(screen.getByRole('spinbutton', { name: 'Score value' }), '0')

    await user.click(screen.getByRole('checkbox', { name: 'Change progress' }))
    await user.clear(screen.getByRole('spinbutton', { name: 'Progress value' }))
    await user.type(screen.getByRole('spinbutton', { name: 'Progress value' }), '0')

    await user.click(screen.getByRole('checkbox', { name: 'Change notes' }))
    const notes = screen.getByRole('textbox', { name: 'Notes value' })
    await user.type(notes, 'temporary')
    await user.clear(notes)

    await user.click(screen.getByRole('button', { name: 'Apply changes to 3 entries' }))

    expect(props.onSubmit).toHaveBeenCalledWith({
      status: { kind: 'unchanged' },
      score: { kind: 'set', value: 0 },
      progress: { kind: 'set', value: 0 },
      private: { kind: 'unchanged' },
      hiddenFromStatusLists: { kind: 'unchanged' },
      notes: { kind: 'set', value: '' },
      customLists: { Favorites: 'keep', 'Catch-up': 'keep' },
    })
  })

  it('keeps custom-list membership tri-state and leaves unrelated fields unchanged', async () => {
    const user = userEvent.setup()
    const props = defaultProps()
    render(<BulkEditDialog {...props} />)

    await user.click(screen.getByRole('radio', { name: 'Add Favorites' }))
    await user.click(screen.getByRole('radio', { name: 'Remove Catch-up' }))
    await user.click(screen.getByRole('button', { name: 'Apply changes to 3 entries' }))

    expect(props.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        status: { kind: 'unchanged' },
        customLists: { Favorites: 'add', 'Catch-up': 'remove' },
      }),
    )
  })

  it('disables only custom-list controls when their catalog is unavailable', async () => {
    const user = userEvent.setup()
    const props = defaultProps({
      customListCatalog: {
        status: 'error',
        names: ['Stale list'],
        lastSyncedAt: Date.UTC(2026, 6, 10, 12),
      },
    })
    render(<BulkEditDialog {...props} />)

    expect(screen.getByRole('radio', { name: 'Add Stale list' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Change status' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Refresh custom lists' }))
    expect(props.onRefreshCatalog).toHaveBeenCalledOnce()
  })

  it('never submits retained custom-list intent while the catalog is unavailable', async () => {
    const user = userEvent.setup()
    const props = defaultProps()
    const { rerender } = render(<BulkEditDialog {...props} />)

    await user.click(screen.getByRole('radio', { name: 'Add Favorites' }))
    rerender(
      <BulkEditDialog
        {...props}
        customListCatalog={{ status: 'error', names: ['Favorites'] }}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Apply changes to 3 entries' }),
    ).toBeDisabled()

    await user.click(screen.getByRole('checkbox', { name: 'Change status' }))
    await user.click(
      screen.getByRole('button', { name: 'Apply changes to 3 entries' }),
    )

    expect(props.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ customLists: { Favorites: 'keep' } }),
    )
  })

  it('announces semantic progress and exposes cancellation while a job runs', async () => {
    const user = userEvent.setup()
    const progress: BulkJobProgress = {
      phase: 'mutating',
      total: 10,
      attempted: 4,
      confirmed: 3,
      failed: 1,
      unattempted: 6,
      stats,
    }
    const props = defaultProps({ running: true, progress })
    render(<BulkEditDialog {...props} />)

    expect(screen.getByRole('progressbar', { name: 'Bulk edit progress' })).toHaveAttribute(
      'aria-valuenow',
      '4',
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Updating entries: 3 confirmed, 1 failed, 6 waiting.',
    )

    await user.click(screen.getByRole('button', { name: 'Cancel bulk job' }))
    expect(props.onCancel).toHaveBeenCalledOnce()
  })

  it('announces action failures inside the modal dialog', () => {
    render(
      <BulkEditDialog
        {...defaultProps({ actionError: 'Targeted verification is offline.' })}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Targeted verification is offline.',
    )
  })

  it('retains form values after a partial outcome and retries only through its callback', async () => {
    const user = userEvent.setup()
    const props = defaultProps()
    const { rerender } = render(<BulkEditDialog {...props} />)

    await user.click(screen.getByRole('checkbox', { name: 'Change score' }))
    const score = screen.getByRole('spinbutton', { name: 'Score value' })
    await user.clear(score)
    await user.type(score, '7.5')

    const outcome: BulkJobOutcome = {
      status: 'partial',
      confirmedPatches: [
        { entryId: 1, mediaType: 'ANIME', values: { score: 7.5 } },
      ],
      confirmedDeletedIds: [],
      failures: [
        {
          entryId: 2,
          kind: 'network',
          message: 'The request failed.',
          retryable: true,
        },
      ],
      unattemptedIds: [3],
      stats,
    }
    rerender(<BulkEditDialog {...props} outcome={outcome} />)

    expect(screen.getByRole('spinbutton', { name: 'Score value' })).toHaveValue(7.5)
    expect(screen.getByRole('status')).toHaveTextContent(
      '1 entry confirmed. 1 failed and 1 unattempted.',
    )

    await user.click(screen.getByRole('button', { name: 'Retry 2 remaining entries' }))
    expect(props.onRetryRemaining).toHaveBeenCalledOnce()
  })

  it('preserves the retained edit when a partial outcome is closed and reopened', async () => {
    const user = userEvent.setup()
    const props = defaultProps()
    const { rerender } = render(<BulkEditDialog {...props} />)

    await user.click(screen.getByRole('checkbox', { name: 'Change score' }))
    const score = screen.getByRole('spinbutton', { name: 'Score value' })
    await user.clear(score)
    await user.type(score, '7.5')

    const outcome: BulkJobOutcome = {
      status: 'partial',
      confirmedPatches: [
        { entryId: 1, mediaType: 'ANIME', values: { score: 7.5 } },
      ],
      confirmedDeletedIds: [],
      failures: [
        {
          entryId: 2,
          kind: 'network',
          message: 'The request failed.',
          retryable: true,
        },
      ],
      unattemptedIds: [3],
      stats,
    }
    const pendingProps = { ...props, selectedCount: 2, outcome }
    rerender(<BulkEditDialog {...pendingProps} />)
    rerender(<BulkEditDialog {...pendingProps} open={false} />)
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    rerender(<BulkEditDialog {...pendingProps} />)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    expect(screen.getByRole('checkbox', { name: 'Change score' })).toBeChecked()
    expect(screen.getByRole('spinbutton', { name: 'Score value' })).toHaveValue(
      7.5,
    )
    expect(
      screen.getByRole('button', { name: 'Retry 2 remaining entries' }),
    ).toBeEnabled()
    expect(
      screen.queryByRole('button', { name: 'Apply changes to 2 entries' }),
    ).not.toBeInTheDocument()
  })

  it('locks an ambiguous outcome to targeted verification only', async () => {
    const user = userEvent.setup()
    const outcome: BulkJobOutcome = {
      status: 'unknown',
      confirmedPatches: [],
      confirmedDeletedIds: [],
      failures: [
        {
          entryId: 2,
          kind: 'unknown',
          message: 'The mutation result is uncertain.',
          retryable: false,
        },
      ],
      unattemptedIds: [],
      stats,
    }
    const props = defaultProps({ selectedCount: 1, outcome })
    render(<BulkEditDialog {...props} />)

    expect(screen.getByRole('checkbox', { name: 'Change score' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Verify 1 uncertain entry' }),
    ).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Apply changes to 1 entry' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Delete 1 selected entry' }),
    ).not.toBeInTheDocument()

    const dialog = screen.getByRole('dialog')
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    fireEvent.click(dialog)
    const lockedClose = screen.getByRole('button', {
      name: 'Uncertain results require verification before closing',
    })
    expect(lockedClose).toBeDisabled()
    await user.click(lockedClose)
    expect(props.onClose).not.toHaveBeenCalled()

    await user.click(
      screen.getByRole('button', { name: 'Verify 1 uncertain entry' }),
    )
    expect(props.onRetryRemaining).toHaveBeenCalledOnce()
  })

  it('uses a safe confirmation step for deleting the same frozen selection', async () => {
    const user = userEvent.setup()
    const props = defaultProps()
    const { rerender } = render(<BulkEditDialog {...props} />)

    await user.click(screen.getByRole('button', { name: 'Delete 3 selected entries' }))

    expect(screen.getByRole('heading', { name: 'Delete 3 entries from Ari?' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Keep entries' })).toHaveFocus())

    rerender(<BulkEditDialog {...props} accountName="Changed" selectedCount={99} />)
    expect(screen.getByRole('heading', { name: 'Delete 3 entries from Ari?' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Confirm deletion of 3 entries' }))
    expect(props.onDelete).toHaveBeenCalledOnce()
  })

  it('can open directly in delete confirmation mode', () => {
    render(<BulkEditDialog {...defaultProps({ initialMode: 'delete' })} />)

    expect(
      screen.getByRole('heading', { name: 'Delete 3 entries from Ari?' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Confirm deletion of 3 entries' }),
    ).toBeEnabled()
  })

  it('refreshes the destructive count after a terminal partial outcome', () => {
    const props = defaultProps({ initialMode: 'delete' })
    const { rerender } = render(<BulkEditDialog {...props} />)
    const outcome: BulkJobOutcome = {
      status: 'partial',
      confirmedPatches: [],
      confirmedDeletedIds: [1],
      failures: [
        {
          entryId: 2,
          kind: 'network',
          message: 'Try again.',
          retryable: true,
        },
      ],
      unattemptedIds: [3],
      stats,
    }

    rerender(
      <BulkEditDialog {...props} selectedCount={2} outcome={outcome} />,
    )

    expect(
      screen.getByRole('heading', { name: 'Delete 2 entries from Ari?' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Confirm deletion of 2 entries' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Retry 2 remaining entries' }),
    ).toBeEnabled()
  })

  it('allows Escape to close only when no job is active', () => {
    const idleProps = defaultProps()
    const { rerender } = render(<BulkEditDialog {...idleProps} />)
    const dialog = screen.getByRole('dialog')

    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(idleProps.onClose).toHaveBeenCalledOnce()

    const runningProps = defaultProps({ running: true })
    rerender(<BulkEditDialog {...runningProps} />)
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(runningProps.onClose).not.toHaveBeenCalled()
  })
})
