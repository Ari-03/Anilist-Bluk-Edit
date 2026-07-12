import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ProgressBar } from './ProgressBar'

describe('ProgressBar', () => {
  it('exposes its label, bounded values, and human-readable progress', () => {
    const { rerender } = render(
      <ProgressBar
        label="Saving entries"
        value={37}
        max={80}
        valueText="37 of 80 entries saved"
      />,
    )

    const progress = screen.getByRole('progressbar', { name: 'Saving entries' })
    expect(progress).toHaveAttribute('aria-valuemin', '0')
    expect(progress).toHaveAttribute('aria-valuemax', '80')
    expect(progress).toHaveAttribute('aria-valuenow', '37')
    expect(progress).toHaveAttribute('aria-valuetext', '37 of 80 entries saved')
    expect(screen.getByText('37 of 80 entries saved')).toBeVisible()

    rerender(<ProgressBar label="Saving entries" value={100} max={80} />)
    expect(progress).toHaveAttribute('aria-valuenow', '80')
    expect(progress.firstElementChild).toHaveStyle({ width: '100%' })
  })
})
