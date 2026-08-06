import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useStore } from '@/store'
import { AniListClient } from '@/lib/anilist'
import Layout from '@/components/Layout'
import MediaListView from '@/components/media/MediaListView'
import MediaGridSkeleton from '@/components/media/MediaGridSkeleton'
import BulkEditPanel from '@/components/bulk/BulkEditPanel'
import LeftSidebar from '@/components/sidebar/LeftSidebar'
import MobileSidebar from '@/components/sidebar/MobileSidebar'
import ActiveFilterChips from '@/components/sidebar/ActiveFilterChips'
import NotificationList from '@/components/NotificationList'
import TokenLogin from '@/components/TokenLogin'
import AccountSwitcher from '@/components/AccountSwitcher'
import ProgressBar from '@/components/ui/ProgressBar'
import { Layers, Moon, Sun, RotateCcw, SlidersHorizontal } from 'lucide-react'

export default function Home() {
  const { user: authUser, accessToken, isLoading: authLoading } = useAuth()
  const {
    user,
    darkMode,
    currentType,
    isLoadingLists,
    bulkEditMode,
    viewMode,
    setUser,
    setAccessToken,
    upsertAccount,
    addNotification,
    toggleDarkMode,
    getCurrentLists,
  } = useStore()

  const [client, setClient] = useState<AniListClient | null>(null)
  const [isManualRefreshing, setIsManualRefreshing] = useState(false)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  const handleManualRefresh = async () => {
    if (!client || !authUser || isManualRefreshing) return
    setIsManualRefreshing(true)
    try {
      await useStore.getState().fetchMediaLists(authUser.id, currentType, true)
      addNotification({ type: 'success', message: 'Lists refreshed' })
    } catch (error) {
      addNotification({ type: 'error', message: 'Refresh failed — check your connection' })
    } finally {
      setIsManualRefreshing(false)
    }
  }

  useEffect(() => {
    if (accessToken) {
      setClient(new AniListClient(accessToken))
      setAccessToken(accessToken)
    } else {
      setClient(null)
    }
  }, [accessToken, setAccessToken])

  // Always adopt the freshest auth user (session restore re-fetches the
  // profile, so custom lists created on anilist.co propagate here) — the
  // persisted store user must never win over fresh data for the same account.
  useEffect(() => {
    if (authUser) {
      setUser(authUser)
    }
  }, [authUser, setUser])

  // Keep the multi-account registry in sync: every successful auth (fresh
  // sign-in, session restore, account switch) registers/activates the account
  useEffect(() => {
    if (authUser && accessToken) {
      upsertAccount(authUser, accessToken)
    }
  }, [authUser, accessToken, upsertAccount])

  // Load media lists when client and user are ready.
  // currentType is NOT a dependency: both anime and manga are fetched at once.
  useEffect(() => {
    if (client && authUser && user) {
      useStore.getState().fetchMediaLists(authUser.id, currentType, false)
        .catch(() => {
          addNotification({
            type: 'error',
            message: 'Failed to load your media lists. Please try refreshing.'
          })
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, authUser, user])

  // Apply dark mode class to document
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page">
        <div className="text-center">
          <div className="loading-spinner w-10 h-10 mx-auto mb-4"></div>
          <p className="text-sm text-fg-muted">Signing you in…</p>
        </div>
      </div>
    )
  }

  if (!accessToken || !authUser) {
    return <TokenLogin />
  }

  const hasData = getCurrentLists().length > 0
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
                <button
                  onClick={() => setMobileFiltersOpen(true)}
                  className="btn-icon md:hidden"
                  title="Filters"
                >
                  <SlidersHorizontal className="w-5 h-5" />
                </button>
                <div className="w-8 h-8 rounded-lg brand-gradient flex items-center justify-center">
                  <Layers className="w-[18px] h-[18px] text-white" />
                </div>
                <h1 className="text-base font-bold text-fg hidden sm:block">
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

                <div className="w-px h-5 bg-edge mx-1.5" />

                <AccountSwitcher />
              </div>
            </div>
          </div>
          {/* Slim refresh indicator: keeps content visible during refetches */}
          {showRefreshBar && (
            <ProgressBar value={0} max={1} indeterminate className="h-0.5 rounded-none bg-transparent" />
          )}
        </header>

        {/* Main content with sidebar */}
        <div className="flex">
          <LeftSidebar />
          <MobileSidebar open={mobileFiltersOpen} onClose={() => setMobileFiltersOpen(false)} />

          <main className={`flex-1 min-w-0 ${bulkEditMode ? 'pb-32' : ''}`}>
            <div className="mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4 max-w-[1600px]">
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
