import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  NotificationRegion,
  notificationActions,
  useNotifications,
} from './NotificationRegion'
import { NotificationAnnouncer } from './notifications'

function NotificationHarness() {
  const { enqueue } = useNotifications()

  return (
    <>
      <button
        type="button"
        onClick={() =>
          enqueue({
            tone: 'error',
            title: 'List refresh failed',
            message: 'Your existing entries are still available.',
            dedupeKey: 'collection-refresh',
            durationMs: null,
          })
        }
      >
        Report failure
      </button>
      <NotificationAnnouncer />
      <NotificationRegion />
    </>
  )
}

afterEach(() => {
  notificationActions.clear()
  vi.useRealTimers()
})

describe('NotificationRegion', () => {
  it('announces a failure once and exposes a labelled dismiss action', async () => {
    const user = userEvent.setup()
    render(<NotificationHarness />)

    const region = screen.getByRole('region', { name: 'Notifications' })
    expect(region).toHaveAttribute('aria-live', 'off')
    const announcer = screen.getByLabelText(
      'Urgent notification announcements',
    )
    expect(announcer).toHaveAttribute('aria-live', 'assertive')

    const report = screen.getByRole('button', { name: 'Report failure' })
    await user.click(report)
    await user.click(report)

    expect(
      within(region).getByText('Your existing entries are still available.'),
    ).toBeVisible()
    expect(announcer).toHaveTextContent(
      'List refresh failed: Your existing entries are still available.',
    )

    await user.click(
      screen.getByRole('button', { name: 'Dismiss List refresh failed notification' }),
    )
    expect(
      within(region).queryByText('Your existing entries are still available.'),
    ).not.toBeInTheDocument()
    expect(announcer).toBeEmptyDOMElement()
  })

  it('starts auto-dismiss timing when a queued message reaches the live region', () => {
    vi.useFakeTimers()
    const { rerender } = render(<NotificationAnnouncer />)
    act(() => {
      notificationActions.enqueue({
        tone: 'info',
        message: 'Queued while the renderer loads.',
        durationMs: 1_000,
      })
    })
    vi.advanceTimersByTime(2_000)
    expect(
      screen.getByLabelText('Notification announcements'),
    ).toHaveTextContent('Queued while the renderer loads.')

    rerender(
      <>
        <NotificationAnnouncer />
        <NotificationRegion />
      </>,
    )
    const region = screen.getByRole('region', { name: 'Notifications' })
    expect(
      within(region).getByText('Queued while the renderer loads.'),
    ).toBeVisible()

    act(() => vi.advanceTimersByTime(999))
    expect(
      within(region).getByText('Queued while the renderer loads.'),
    ).toBeVisible()
    act(() => vi.advanceTimersByTime(1))
    expect(
      within(region).queryByText('Queued while the renderer loads.'),
    ).not.toBeInTheDocument()
  })
})
