import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { beforeAll, describe, expect, it } from 'vitest'

import { Dialog } from './Dialog'

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

function DialogHarness({
  closeOnBackdrop = true,
  closeDisabled = false,
}: {
  closeOnBackdrop?: boolean
  closeDisabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const initialFocusRef = useRef<HTMLInputElement>(null)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open editor
      </button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Edit selected entries"
        description="Changes apply to the active account only."
        initialFocusRef={initialFocusRef}
        closeOnBackdrop={closeOnBackdrop}
        closeDisabled={closeDisabled}
        closeLabel={
          closeDisabled
            ? 'Uncertain results require verification before closing'
            : 'Close editor'
        }
      >
        <label>
          Notes
          <input ref={initialFocusRef} />
        </label>
      </Dialog>
    </>
  )
}

describe('Dialog', () => {
  it('opens with an accessible name and description, focuses safely, and returns focus', async () => {
    const user = userEvent.setup()
    render(<DialogHarness />)

    const opener = screen.getByRole('button', { name: 'Open editor' })
    await user.click(opener)

    const dialog = screen.getByRole('dialog', { name: 'Edit selected entries' })
    expect(dialog).toHaveAccessibleDescription('Changes apply to the active account only.')
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveFocus())

    fireEvent(dialog, new Event('cancel', { cancelable: true }))

    await waitFor(() => expect(dialog).not.toHaveAttribute('open'))
    expect(opener).toHaveFocus()
  })

  it('only treats a backdrop click as a close request when enabled', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<DialogHarness closeOnBackdrop={false} />)

    await user.click(screen.getByRole('button', { name: 'Open editor' }))
    let dialog = screen.getByRole('dialog')
    fireEvent.click(dialog)
    expect(dialog).toHaveAttribute('open')

    rerender(<DialogHarness closeOnBackdrop />)
    dialog = screen.getByRole('dialog')
    fireEvent.click(dialog)
    await waitFor(() => expect(dialog).not.toHaveAttribute('open'))
  })

  it('disables the top close control with its explanatory label', async () => {
    const user = userEvent.setup()
    render(<DialogHarness closeOnBackdrop={false} closeDisabled />)

    await user.click(screen.getByRole('button', { name: 'Open editor' }))

    expect(
      screen.getByRole('button', {
        name: 'Uncertain results require verification before closing',
      }),
    ).toBeDisabled()
  })
})
