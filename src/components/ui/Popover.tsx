import { ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, m } from 'framer-motion'
import { cn } from '@/lib/utils'

export interface PopoverPosition {
    top: number
    left: number
}

interface PopoverProps {
    open: boolean
    position: PopoverPosition | null
    onClose: () => void
    className?: string
    children: ReactNode
}

/**
 * Fixed-position popout anchored next to a trigger (used by sidebar filters).
 * Renders a transparent backdrop that closes on click; Escape also closes.
 * Portaled to <body>: the sidebar is position:sticky, whose stacking context
 * would otherwise trap the popover below the media cards.
 */
export default function Popover({ open, position, onClose, className, children }: PopoverProps) {
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])

    useEffect(() => {
        if (!open) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open, onClose])

    if (!mounted) return null

    return createPortal(
        <AnimatePresence>
            {open && position && (
                <>
                    <div className="fixed inset-0 z-popover" onClick={onClose} />
                    <m.div
                        className={cn('fixed z-popover card p-4 shadow-overlay', className)}
                        style={{ top: position.top, left: position.left }}
                        initial={{ opacity: 0, scale: 0.96, x: -4 }}
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.98, x: -2 }}
                        transition={{ duration: 0.14, ease: 'easeOut' }}
                    >
                        {children}
                    </m.div>
                </>
            )}
        </AnimatePresence>,
        document.body
    )
}
