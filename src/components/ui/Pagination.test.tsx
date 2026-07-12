import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Pagination } from './Pagination'

describe('Pagination', () => {
  it('announces the current range and exposes bounded page controls', async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()
    const onPageSizeChange = vi.fn()
    render(
      <Pagination
        page={3}
        totalEntries={525}
        pageSize={100}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />,
    )

    expect(screen.getByRole('navigation', { name: 'List pagination' })).toBeVisible()
    expect(screen.getByText('201–300 of 525 entries')).toBeVisible()
    expect(screen.getByText('Page 3 of 6')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Previous page' }))
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    expect(onPageChange).toHaveBeenNthCalledWith(1, 2)
    expect(onPageChange).toHaveBeenNthCalledWith(2, 4)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Entries per page' }), '250')
    expect(onPageSizeChange).toHaveBeenCalledWith(250)
  })

  it('disables navigation beyond the available range', () => {
    render(
      <Pagination
        page={1}
        totalEntries={0}
        pageSize={50}
        onPageChange={() => undefined}
        onPageSizeChange={() => undefined}
      />,
    )

    expect(screen.getByText('0 of 0 entries')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
  })
})
