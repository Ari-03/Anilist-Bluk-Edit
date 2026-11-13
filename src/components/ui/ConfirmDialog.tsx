import { ReactNode, RefObject } from 'react'
import { AlertTriangle } from 'lucide-react'
import Modal, { ModalDescription, ModalTitle } from '@/components/ui/Modal'
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
    fallbackFocus?: RefObject<HTMLElement | null>
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
    fallbackFocus,
}: ConfirmDialogProps) {
    return (
        <Modal open={open} onClose={onCancel} dismissible={!busy} layer="z-confirm" className="max-w-md p-6" describedBy={!!children} fallbackFocus={fallbackFocus}>
            <div className="flex items-start gap-3">
                {danger && (
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center">
                        <AlertTriangle className="w-5 h-5 text-danger" aria-hidden />
                    </div>
                )}
                <div className="min-w-0 flex-1">
                    <ModalTitle className="text-base font-semibold text-fg">{title}</ModalTitle>
                    {children && (
                        <ModalDescription asChild>
                            <div className="mt-2 text-sm text-fg-muted">{children}</div>
                        </ModalDescription>
                    )}
                </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
                <button className="btn-secondary" onClick={onCancel} disabled={busy}>
                    {cancelLabel}
                </button>
                <button className={cn(danger ? 'btn-danger' : 'btn-primary')} onClick={onConfirm} disabled={busy}>
                    {busy && <span className="loading-spinner w-4 h-4 border-2" aria-hidden />}
                    {confirmLabel}
                </button>
            </div>
        </Modal>
    )
}
