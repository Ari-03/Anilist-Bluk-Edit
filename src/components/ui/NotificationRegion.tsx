'use client'

import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef } from 'react'

import { IconButton } from './IconButton'
import {
  useNotificationStore,
  type NotificationTone,
} from './notifications'

export {
  notificationActions,
  useNotifications,
  useNotificationStore,
} from './notifications'
export type {
  Notification,
  NotificationActions,
  NotificationInput,
  NotificationTone,
} from './notifications'

const tonePresentation: Record<
  NotificationTone,
  { Icon: LucideIcon; classes: string; iconClasses: string }
> = {
  success: {
    Icon: CheckCircle2,
    classes:
      'border-green-200 bg-green-50 text-green-950 dark:border-green-800 dark:bg-green-950 dark:text-green-50',
    iconClasses: 'text-green-700 dark:text-green-300',
  },
  error: {
    Icon: XCircle,
    classes:
      'border-red-200 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950 dark:text-red-50',
    iconClasses: 'text-red-700 dark:text-red-300',
  },
  warning: {
    Icon: AlertTriangle,
    classes:
      'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-50',
    iconClasses: 'text-amber-700 dark:text-amber-300',
  },
  info: {
    Icon: Info,
    classes:
      'border-blue-200 bg-blue-50 text-blue-950 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-50',
    iconClasses: 'text-blue-700 dark:text-blue-300',
  },
}

export interface NotificationRegionProps {
  className?: string
}

export function NotificationRegion({ className = '' }: NotificationRegionProps) {
  const notifications = useNotificationStore((state) => state.notifications)
  const dismiss = useNotificationStore((state) => state.dismiss)
  const firstRenderedAt = useRef(new Map<string, number>())

  useEffect(() => {
    const now = Date.now()
    const activeIds = new Set(notifications.map(({ id }) => id))
    for (const id of firstRenderedAt.current.keys()) {
      if (!activeIds.has(id)) firstRenderedAt.current.delete(id)
    }
    const timers = notifications.flatMap((notification) => {
      if (notification.durationMs === null) return []
      const renderedAt = firstRenderedAt.current.get(notification.id) ?? now
      firstRenderedAt.current.set(notification.id, renderedAt)
      const remaining = Math.max(
        0,
        renderedAt + notification.durationMs - now,
      )
      return [window.setTimeout(() => dismiss(notification.id), remaining)]
    })

    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [dismiss, notifications])

  return (
    <section
      aria-label="Notifications"
      aria-live="off"
      className={`pointer-events-none fixed right-4 top-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 ${className}`}
    >
      {notifications.map((notification) => {
        const { Icon, classes, iconClasses } = tonePresentation[notification.tone]
        const dismissName = notification.title ?? notification.tone

        return (
          <article
            key={notification.id}
            aria-atomic="true"
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-3 shadow-lg ${classes}`}
          >
            <Icon aria-hidden="true" className={`mt-0.5 h-5 w-5 shrink-0 ${iconClasses}`} />
            <div className="min-w-0 flex-1">
              {notification.title ? (
                <p className="text-sm font-semibold">{notification.title}</p>
              ) : null}
              <p className={`break-words text-sm ${notification.title ? 'mt-0.5' : ''}`}>
                {notification.message}
              </p>
            </div>
            <IconButton
              label={`Dismiss ${dismissName} notification`}
              size="sm"
              className="-m-2"
              onClick={() => dismiss(notification.id)}
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </IconButton>
          </article>
        )
      })}
    </section>
  )
}
