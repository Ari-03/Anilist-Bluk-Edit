import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { useStore } from '@/store'
import { cn } from '@/lib/utils'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'

const AUTO_DISMISS_MS = 5000
const MAX_VISIBLE = 4

const STYLES: Record<string, { icon: typeof Info; accent: string; iconColor: string }> = {
    success: { icon: CheckCircle, accent: 'border-l-success', iconColor: 'text-success' },
    error: { icon: XCircle, accent: 'border-l-danger', iconColor: 'text-danger' },
    warning: { icon: AlertTriangle, accent: 'border-l-warning', iconColor: 'text-warning' },
    info: { icon: Info, accent: 'border-l-accent', iconColor: 'text-accent' },
}

interface ToastProps {
    id: string
    type: string
    message: string
    onDismiss: () => void
}

function Toast({ type, message, onDismiss }: ToastProps) {
    const [hovered, setHovered] = useState(false)
    const remainingRef = useRef(AUTO_DISMISS_MS)
    const startedAtRef = useRef(Date.now())
    // Latest-ref so the timer effect keys ONLY on hover — a fresh onDismiss
    // closure per parent render must not restart the countdown
    const onDismissRef = useRef(onDismiss)
    onDismissRef.current = onDismiss

    // Auto-dismiss with hover-to-pause: the timer only runs while not hovered
    useEffect(() => {
        if (hovered) {
            remainingRef.current -= Date.now() - startedAtRef.current
            return
        }
        startedAtRef.current = Date.now()
        const timer = setTimeout(() => onDismissRef.current(), Math.max(0, remainingRef.current))
        return () => clearTimeout(timer)
    }, [hovered])

    const style = STYLES[type] ?? STYLES.info
    const Icon = style.icon

    return (
        <m.div
            layout
            initial={{ opacity: 0, x: 48, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24, scale: 0.96, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className={cn('card border-l-4 p-3.5 shadow-raised', style.accent)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <div className="flex items-start gap-2.5">
                <Icon className={cn('w-[18px] h-[18px] flex-shrink-0 mt-px', style.iconColor)} />
                <p className="flex-1 min-w-0 text-sm text-fg break-words">{message}</p>
                <button
                    onClick={onDismiss}
                    className="flex-shrink-0 p-0.5 rounded text-fg-subtle hover:text-fg hover:bg-raised transition-colors"
                    aria-label="Dismiss notification"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
        </m.div>
    )
}

export default function NotificationList() {
    const notifications = useStore(s => s.notifications)
    const removeNotification = useStore(s => s.removeNotification)
    const visible = notifications.slice(-MAX_VISIBLE)

    return (
        <div className="fixed top-4 right-4 z-notification space-y-2 w-80 max-w-[calc(100vw-2rem)] pointer-events-none">
            <AnimatePresence initial={false}>
                {visible.map(n => (
                    <div key={n.id} className="pointer-events-auto">
                        <Toast
                            id={n.id}
                            type={n.type}
                            message={n.message}
                            onDismiss={() => removeNotification(n.id)}
                        />
                    </div>
                ))}
            </AnimatePresence>
        </div>
    )
}
