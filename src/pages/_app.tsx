import { useEffect, useState } from 'react'
import type { AppProps } from 'next/app'
import dynamic from 'next/dynamic'

import { AppProvider } from '@/contexts/AppContext'
import type { NotificationRegionProps } from '@/components/ui'
import {
  NotificationAnnouncer,
  useNotificationStore,
} from '@/components/ui/notifications'
import { redactAnalyticsUrl } from '@/lib/privacy-analytics'
import '@/styles/globals.css'

const Analytics = dynamic(
  () =>
    import('@vercel/analytics/next').then((module) => module.Analytics),
  { ssr: false },
)

const NotificationRegion = dynamic<NotificationRegionProps>(
  () =>
    import('@/components/ui/NotificationRegion').then(
      (module) => module.NotificationRegion,
    ),
  { ssr: false },
)

function DeferredNotificationRegion() {
  const hasNotifications = useNotificationStore(
    (state) => state.notifications.length > 0,
  )
  return hasNotifications ? <NotificationRegion /> : null
}

function DeferredAnalytics() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Analytics remains enabled, but it should not compete with account vault,
    // gateway, and workspace startup on the critical linked-account boot path.
    const timer = window.setTimeout(() => setReady(true), 3_000)
    return () => window.clearTimeout(timer)
  }, [])

  return ready ? <Analytics beforeSend={redactAnalyticsUrl} /> : null
}

export default function App({ Component, pageProps, router }: AppProps) {
  return (
    <AppProvider>
      <Component {...pageProps} />
      <NotificationAnnouncer />
      <DeferredNotificationRegion />
      {router.pathname === '/auth/callback' ? null : <DeferredAnalytics />}
    </AppProvider>
  )
}
