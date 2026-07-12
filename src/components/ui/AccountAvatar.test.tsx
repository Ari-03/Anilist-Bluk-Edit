import { fireEvent, render, screen } from '@testing-library/react'
import { type ImgHTMLAttributes, createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { AccountAvatar } from './AccountAvatar'

vi.mock('next/image', () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => createElement('img', props),
}))

describe('AccountAvatar', () => {
  it('uses the linked account image when one is available', () => {
    render(
      <AccountAvatar
        name="Ari Das"
        avatarUrl="https://s4.anilist.co/file/anilistcdn/user/avatar/large/example.png"
      />,
    )

    expect(screen.getByRole('img', { name: 'Ari Das avatar' })).toHaveAttribute(
      'src',
      'https://s4.anilist.co/file/anilistcdn/user/avatar/large/example.png',
    )
  })

  it('falls back to deterministic initials when the image is absent or fails', () => {
    const { rerender } = render(<AccountAvatar name="Ari Das" avatarUrl={null} />)
    expect(screen.getByRole('img', { name: 'Ari Das avatar' })).toHaveTextContent('AD')

    rerender(
      <AccountAvatar
        name="Miku"
        avatarUrl="https://s4.anilist.co/file/anilistcdn/user/avatar/large/missing.png"
      />,
    )
    fireEvent.error(screen.getByRole('img', { name: 'Miku avatar' }))
    expect(screen.getByRole('img', { name: 'Miku avatar' })).toHaveTextContent('MI')
  })
})
