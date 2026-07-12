import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/contexts/AppContext', () => ({ useApp: vi.fn() }))

import { useApp } from '@/contexts/AppContext'

import { Onboarding } from './Onboarding'

const remove = vi.fn(async () => {})
const forgetAll = vi.fn(async () => {})

function appValue() {
  return {
    status: 'ready' as const,
    startupError: null,
    accounts: [
      {
        id: 7,
        name: 'Expired account',
        avatarUrl: null,
        tokenExpiresAt: 0,
        linkedAt: 1,
        lastUsedAt: 2,
        state: 'reauth-required' as const,
      },
    ],
    legacyCandidate: null,
    beginLink: vi.fn(),
    activate: vi.fn(async () => {}),
    remove,
    forgetAll,
    importLegacy: vi.fn(async () => {
      throw new Error('No legacy account')
    }),
    deleteLegacy: vi.fn(),
  } as unknown as ReturnType<typeof useApp>
}

describe('Onboarding account cleanup', () => {
  beforeEach(() => {
    remove.mockClear()
    forgetAll.mockClear()
    vi.mocked(useApp).mockReturnValue(appValue())
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('can remove an account that requires reauthentication', async () => {
    const user = userEvent.setup()
    render(<Onboarding />)

    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(window.confirm).toHaveBeenCalledWith(
      'Remove Expired account from this browser? This does not revoke AniList access.',
    )
    expect(remove).toHaveBeenCalledWith(7)
  })

  it('can forget every linked account without first activating one', async () => {
    const user = userEvent.setup()
    render(<Onboarding />)

    await user.click(
      screen.getByRole('button', { name: 'Forget all accounts' }),
    )

    expect(window.confirm).toHaveBeenCalledWith(
      'Forget every linked account and local preference? This does not revoke AniList access.',
    )
    expect(forgetAll).toHaveBeenCalledOnce()
  })
})
