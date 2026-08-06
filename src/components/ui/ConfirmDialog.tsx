import { ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, m } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ConfirmDialogProps {
    open: boolean
    title: string
    children?: ReactNode
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
    busy?: boolean
    onConfirm: () => void
    onCancel: () => void
}

export default function ConfirmDialog({
    open,
    title,
    children,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = false,
    busy = false,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])

    useEffect(() => {
        if (!open) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onCancel()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open, onCancel])

    if (!mounted) return null

    // Portaled to <body>: ancestors with backdrop-filter (e.g. the sticky header)
    // would otherwise become the containing block for this fixed overlay.
    return createPortal(
        <AnimatePresence>
            {open && (
                <m.div
                    className="fixed inset-0 z-confirm flex items-center justify-center p-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                >
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={busy ? undefined : onCancel} />
                    <m.div
                        role="dialog"
                        aria-modal="true"
                        aria-label={title}
                        className="relative w-full max-w-md card p-6 shadow-overlay"
                        initial={{ opacity: 0, scale: 0.95, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: 4 }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                    >
                        <div className="flex items-start gap-3">
                            {danger && (
                                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center">
                                    <AlertTriangle className="w-5 h-5 text-danger" />
                                </div>
                            )}
                            <div className="min-w-0 flex-1">
                                <h3 className="text-base font-semibold text-fg">{title}</h3>
                                {children && <div className="mt-2 text-sm text-fg-muted">{children}</div>}
                            </div>
                        </div>
                        <div className="mt-5 flex justify-end gap-2">
                            <button className="btn-secondary" onClick={onCancel} disabled={busy}>
                                {cancelLabel}
                            </button>
                            <button
                                className={cn(danger ? 'btn-danger' : 'btn-primary')}
                                onClick={onConfirm}
                                disabled={busy}
                            >
                                {busy && <span className="loading-spinner w-4 h-4 border-2" />}
                                {confirmLabel}
                            </button>
                        </div>
                    </m.div>
                </m.div>
            )}
        </AnimatePresence>,
        document.body
    )
}
