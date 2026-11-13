import { ReactNode, useRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, m } from 'framer-motion'
import { cn } from '@/lib/utils'

/** Wrap the dialog's visible heading in this so screen readers announce it */
export const ModalTitle = Dialog.Title
export const ModalDescription = Dialog.Description

interface ModalProps {
    open: boolean
    onClose: () => void
    /** False while something must finish first (Escape and outside clicks are ignored) */
    dismissible?: boolean
    /** Centered card, or a drawer from the left edge (mobile filters) */
    variant?: 'center' | 'sheet-left'
    /** Stacking layer from tailwind.config zIndex */
    layer?: 'z-drawer' | 'z-modal' | 'z-confirm'
    /** Classes for the content box */
    className?: string
    /** Set when the content has a ModalDescription */
    describedBy?: boolean
    children: ReactNode
}

/**
 * The app's one dialog primitive: Radix handles the focus trap,
 * Escape, scroll lock and aria-modal; framer-motion handles enter/exit.
 * Portaled to <body>, so a backdrop-filter ancestor can't trap it.
 */
export default function Modal({
    open,
    onClose,
    dismissible = true,
    variant = 'center',
    layer = 'z-modal',
    className,
    describedBy = false,
    children,
}: ModalProps) {
    const sheet = variant === 'sheet-left'
    // These dialogs open from state, not a Radix Trigger, so Radix has nowhere
    // to return focus on close; remember what had focus when it opened
    const returnFocus = useRef<HTMLElement | null>(null)
    const guard = (e: Event) => {
        if (!dismissible) e.preventDefault()
    }

    return (
        <Dialog.Root open={open} onOpenChange={(next) => !next && dismissible && onClose()}>
            <AnimatePresence>
                {open && (
                    <Dialog.Portal forceMount>
                        <div className={cn('fixed inset-0 flex p-4', layer, sheet ? 'p-0' : 'items-center justify-center')}>
                            <Dialog.Overlay asChild forceMount>
                                <m.div
                                    className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.15 }}
                                />
                            </Dialog.Overlay>
                            <Dialog.Content
                                asChild
                                forceMount
                                onOpenAutoFocus={() => {
                                    returnFocus.current = document.activeElement as HTMLElement | null
                                }}
                                onCloseAutoFocus={(e) => {
                                    e.preventDefault()
                                    if (returnFocus.current?.isConnected) returnFocus.current.focus()
                                }}
                                onEscapeKeyDown={guard}
                                onPointerDownOutside={guard}
                                onInteractOutside={guard}
                                {...(describedBy ? {} : { 'aria-describedby': undefined })}
                            >
                                <m.div
                                    className={cn(
                                        'relative focus:outline-none',
                                        sheet
                                            ? 'h-full w-80 max-w-[85vw] bg-surface shadow-overlay overflow-y-auto'
                                            : 'w-full card shadow-overlay',
                                        className
                                    )}
                                    initial={sheet ? { x: '-100%' } : { opacity: 0, scale: 0.95, y: 8 }}
                                    animate={sheet ? { x: 0 } : { opacity: 1, scale: 1, y: 0 }}
                                    exit={sheet ? { x: '-100%' } : { opacity: 0, scale: 0.97, y: 4 }}
                                    transition={sheet ? { type: 'spring', stiffness: 380, damping: 36 } : { duration: 0.18, ease: 'easeOut' }}
                                >
                                    {children}
                                </m.div>
                            </Dialog.Content>
                        </div>
                    </Dialog.Portal>
                )}
            </AnimatePresence>
        </Dialog.Root>
    )
}
