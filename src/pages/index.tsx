import { useState, useEffect, useMemo, useRef } from 'react'
import { selectCurrentLists, useStore } from '@/store'
import { useShallow } from 'zustand/react/shallow'
import { AniListClient } from '@/lib/anilist'
import { refreshProfile } from '@/lib/auth'
import Layout from '@/components/Layout'
import MediaListView from '@/components/media/MediaListView'
import MediaGridSkeleton from '@/components/media/MediaGridSkeleton'
import BulkEditPanel from '@/components/bulk/BulkEditPanel'
import LeftSidebar from '@/components/sidebar/LeftSidebar'
import MobileSidebar from '@/components/sidebar/MobileSidebar'
import ActiveFilterChips from '@/components/sidebar/ActiveFilterChips'
import ListToolbar from '@/components/ListToolbar'
import NotificationList from '@/components/NotificationList'
import TokenLogin from '@/components/TokenLogin'
import AccountSwitcher from '@/components/AccountSwitcher'
import SettingsMenu from '@/components/SettingsMenu'
import ProgressBar from '@/components/ui/ProgressBar'
import { Layers, Moon, Sun, RotateCcw } from 'lucide-react'

export default function Home() {
  const {
    user,
    accessToken,
    darkMode,
    currentType,
    isLoadingLists,
    bulkEditMode,
    viewMode,
    addNotification,
    toggleDarkMode,
    currentLists,
  } = useStore(
    useShallow(s => ({
      user: s.user,
      accessToken: s.accessToken,
      darkMode: s.darkMode,
      currentType: s.currentType,
      isLoadingLists: s.isLoadingLists,
      bulkEditMode: s.bulkEditMode,
      viewMode: s.viewMode,
      addNotification: s.addNotification,
      toggleDarkMode: s.toggleDarkMode,
      currentLists: selectCurrentLists(s),
    }))
  )

  // The store hydrates from localStorage on the client only; render the same
  // placeholder as the server until mounted so hydration matches
  const [mounted, setMounted] = useState(false)
  const [isManualRefreshing, setIsManualRefreshing] = useState(false)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const profileChecked = useRef(false)

  const client = useMemo(() => (accessToken ? new AniListClient(accessToken) : null), [accessToken])
  const userId = user?.id

  // Re-validate the saved account once per page load. Its cached profile is
  // shown immediately; a revoked token signs it out, an outage is ignored.
  useEffect(() => {
    setMounted(true)
    if (profileChecked.current) return
    profileChecked.current = true
    void refreshProfile({ quiet: true })
  }, [])

  const handleManualRefresh = async () => {
    if (!client || userId === undefined || isManualRefreshing) return
    setIsManualRefreshing(true)
    try {
      await useStore.getState().fetchMediaLists(userId, currentType, true)
      addNotification({ type: 'success', message: 'Lists refreshed' })
    } catch {
      // fetchMediaLists already reported the error
    } finally {
      setIsManualRefreshing(false)
    }
  }

  // Load lists for the active account (again after a switch, which clears
  // them). Profile refreshes don't refetch: fetchMediaLists checks freshness.
  useEffect(() => {
    if (client && userId !== undefined) {
      useStore.getState().fetchMediaLists(userId, useStore.getState().currentType, false).catch(() => {})
    }
  }, [client, userId])

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page">
        <div className="text-center">
          <div className="loading-spinner w-10 h-10 mx-auto mb-4"></div>
          <p className="text-sm text-fg-muted">Signing you in…</p>
        </div>
      </div>
    )
  }

  if (!accessToken || !user) {
    // Notifications stay visible here, e.g. why a revoked account was signed out
    return (
      <>
        <TokenLogin />
        <NotificationList />
      </>
    )
  }

  const hasData = currentLists.length > 0
  const showSkeleton = isLoadingLists && !hasData
  const showRefreshBar = (isLoadingLists || isManualRefreshing) && hasData

  return (
    <Layout>
      <div className="min-h-screen bg-page">
        {/* Header */}
        <header className="sticky top-0 z-header bg-surface/80 backdrop-blur-md border-b border-edge">
          <div className="mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg brand-gradient flex items-center justify-center">
                  <Layers className="w-[18px] h-[18px] text-white" />
                </div>
                <h1 className="text-sm font-semibold text-fg hidden sm:block">
                  AniList Bulk Edit
                </h1>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={handleManualRefresh}
                  disabled={isManualRefreshing || isLoadingLists}
                  className="btn-icon"
                  title="Refresh your media lists"
                >
                  <RotateCcw className={`w-[18px] h-[18px] ${(isManualRefreshing || isLoadingLists) ? 'animate-spin' : ''}`} />
                </button>

                <button
                  onClick={toggleDarkMode}
                  className="btn-icon"
                  title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  {darkMode ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
                </button>

                <SettingsMenu />

                <div className="w-px h-5 bg-edge mx-1.5" />

                <AccountSwitcher />
              </div>
            </div>
          </div>
          {/* Slim refresh indicator: keeps content visible during refetches */}
          {showRefreshBar && (
            <ProgressBar value={0} max={1} indeterminate label="Refreshing lists" className="h-0.5 rounded-none bg-transparent" />
          )}
        </header>

        {/* Main content with sidebar */}
        <div className="flex">
          <LeftSidebar />
          <MobileSidebar open={mobileFiltersOpen} onClose={() => setMobileFiltersOpen(false)} />

          {/* Bottom padding keeps the last row clear of the floating bulk edit button / bar */}
          <main className={`flex-1 min-w-0 ${bulkEditMode ? 'pb-32' : 'pb-20'}`}>
            <div className="px-4 sm:px-6 lg:px-8 py-5 space-y-4">
              <ListToolbar onOpenFilters={() => setMobileFiltersOpen(true)} />
              <ActiveFilterChips />
              <BulkEditPanel client={client} />
              {showSkeleton ? (
                <MediaGridSkeleton viewMode={viewMode} />
              ) : (
                <MediaListView client={client} />
              )}
            </div>
          </main>
        </div>

        <NotificationList />
      </div>
    </Layout>
  )
}
