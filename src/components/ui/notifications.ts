'use client'

import { createElement, Fragment } from 'react'
import { create } from 'zustand'

export type NotificationTone = 'success' | 'error' | 'warning' | 'info'

export interface NotificationInput {
  tone?: NotificationTone
  title?: string
  message: string
  dedupeKey?: string
  durationMs?: number | null
}

export interface Notification extends Required<Omit<NotificationInput, 'title'>> {
  id: string
  title?: string
  createdAt: number
}

export interface NotificationActions {
  enqueue: (notification: NotificationInput) => string
  dismiss: (id: string) => void
  clear: () => void
}

interface NotificationState extends NotificationActions {
  notifications: readonly Notification[]
}

let nextNotificationId = 1

function defaultDedupeKey(input: NotificationInput, tone: NotificationTone) {
  return `${tone}\u0000${input.title ?? ''}\u0000${input.message}`
}

function normalizeDuration(durationMs: number | null | undefined) {
  if (durationMs === null) return null
  if (durationMs === undefined) return 6000
  return Number.isFinite(durationMs) ? Math.max(0, durationMs) : 6000
}

export const useNotificationStore = create<NotificationState>()((set) => ({
  notifications: [],
  enqueue: (input) => {
    const tone = input.tone ?? 'info'
    const dedupeKey = input.dedupeKey ?? defaultDedupeKey(input, tone)
    let notificationId = ''

    set((state) => {
      const active = state.notifications.find(
        (notification) => notification.dedupeKey === dedupeKey,
      )
      if (active) {
        notificationId = active.id
        return state
      }

      notificationId = `notification-${nextNotificationId++}`
      return {
        notifications: [
          ...state.notifications,
          {
            id: notificationId,
            tone,
            title: input.title,
            message: input.message,
            dedupeKey,
            durationMs: normalizeDuration(input.durationMs),
            createdAt: Date.now(),
          },
        ],
      }
    })

    return notificationId
  },
  dismiss: (id) =>
    set((state) => ({
      notifications: state.notifications.filter(
        (notification) => notification.id !== id,
      ),
    })),
  clear: () => set({ notifications: [] }),
}))

export const notificationActions: NotificationActions = {
  enqueue: (notification) =>
    useNotificationStore.getState().enqueue(notification),
  dismiss: (id) => useNotificationStore.getState().dismiss(id),
  clear: () => useNotificationStore.getState().clear(),
}

export function useNotifications(): NotificationActions {
  const enqueue = useNotificationStore((state) => state.enqueue)
  const dismiss = useNotificationStore((state) => state.dismiss)
  const clear = useNotificationStore((state) => state.clear)
  return { enqueue, dismiss, clear }
}

export function NotificationAnnouncer() {
  const notifications = useNotificationStore((state) => state.notifications)
  const urgent = notifications.filter(({ tone }) => tone === 'error')
  const polite = notifications.filter(({ tone }) => tone !== 'error')
  const messages = (items: readonly Notification[]) =>
    items.map((notification) =>
      createElement(
        'p',
        { key: notification.id },
        notification.title
          ? `${notification.title}: ${notification.message}`
          : notification.message,
      ),
    )

  return createElement(
    Fragment,
    null,
    createElement(
      'div',
      {
        'aria-label': 'Urgent notification announcements',
        'aria-live': 'assertive',
        'aria-relevant': 'additions text',
        className: 'sr-only',
        role: 'alert',
      },
      messages(urgent),
    ),
    createElement(
      'div',
      {
        'aria-label': 'Notification announcements',
        'aria-live': 'polite',
        'aria-relevant': 'additions text',
        className: 'sr-only',
        role: 'status',
      },
      messages(polite),
    ),
  )
}
