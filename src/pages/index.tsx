import { useState, useEffect } from 'react'
import Image from 'next/image'
import { IKImage } from 'imagekitio-next'
import { useAuth } from '@/contexts/AuthContext'
import { useStore } from '@/store'
import { AniListClient } from '@/lib/anilist'
import { MediaType } from '@/types/anilist'
import Layout from '@/components/Layout'
import MediaListView from '@/components/MediaListView'
import BulkEditPanel from '@/components/BulkEditPanel'
import LeftSidebar from '@/components/LeftSidebar'
import NotificationList from '@/components/NotificationList'
import DebugPanel from '@/components/DebugPanel'
import TokenLogin from '@/components/TokenLogin'
import MobileFAB from '@/components/MobileFAB'
import MobileOverlay from '@/components/MobileOverlay'
import { Loader2, LogIn, LogOut, User, Moon, Sun, RotateCcw, Filter, Edit3, ChevronLeft, ChevronRight } from 'lucide-react'

export default function Home() {
  const { user: authUser, accessToken, isLoading: authLoading, signOut } = useAuth()
  const {
    user,
    darkMode,
    currentType,
    isLoadingLists,
    animeLists,
    mangaLists,
    filters,
    selectedEntries,
    bulkEditMode,
    leftSidebarOpen,
    rightSidebarOpen,
    setUser,
    setAccessToken,
    setAnimeLists,
    setMangaLists,
    setIsLoadingLists,
    setError,
    addNotification,
    toggleDarkMode,
    setLastDataLoad,
    shouldReloadData,
    toggleLeftSidebar,
    toggleRightSidebar,
    setLeftSidebarOpen,
    setRightSidebarOpen,
    setBulkEditMode,
  } = useStore()

  const [client, setClient] = useState<AniListClient | null>(null)
  const [isManualRefreshing, setIsManualRefreshing] = useState(false)
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false)
  const [mobileBulkEditOpen, setMobileBulkEditOpen] = useState(false)

  const activeFilterCount = [
    filters.status?.length ? 1 : 0,
    filters.format?.length ? 1 : 0,
    filters.genre?.length ? 1 : 0,
    filters.country?.length ? 1 : 0,
    filters.year?.start || filters.year?.end ? 1 : 0,
    filters.score?.min || filters.score?.max ? 1 : 0,
    filters.search ? 1 : 0,
  ].reduce((a, b) => a + b, 0)

  const selectedCount = selectedEntries.size

  // Manual refresh function
  const handleManualRefresh = async () => {
    if (!client || !authUser || isManualRefreshing) return

    setIsManualRefreshing(true)
    console.log('Manual refresh triggered by user')

    try {
      await useStore.getState().fetchMediaLists(authUser.id, currentType, true)
      addNotification({
        type: 'success',
        message: 'Successfully refreshed your media lists!'
      })
    } catch (error) {
      console.error('Manual refresh failed:', error)
      addNotification({
        type: 'error',
        message: 'Failed to refresh your lists. Please check your connection.'
      })
    } finally {
      setIsManualRefreshing(false)
    }
  }

  // Initialize AniList client and sync user data when access token is available
  useEffect(() => {
    console.log('Access token changed:', {
      hasToken: !!accessToken,
      tokenLength: accessToken?.length,
      hasAuthUser: !!authUser,
      storeUser: user?.name
    })

    if (accessToken) {
      const anilistClient = new AniListClient(accessToken)
      setClient(anilistClient)
      setAccessToken(accessToken)

      // Sync user data from auth context to store
      if (authUser && (!user || user.id !== authUser.id)) {
        console.log('Syncing user data to store:', authUser.name)
        setUser(authUser)
      }

      console.log('AniList client initialized successfully')
    } else {
      setClient(null)
      console.log('No access token - client cleared')
    }
  }, [accessToken, authUser, user, setAccessToken, setUser])

  // Load media lists when client and user are ready
  // NOTE: currentType is NOT in dependencies because fetchMediaLists fetches BOTH anime and manga
  // so we only need to fetch once after authentication, not every time user switches types
  useEffect(() => {
    if (client && authUser && user) {
      console.log('Triggering data load for user:', {
        userId: authUser.id,
        userName: authUser.name,
        hasAnimeLists: animeLists.length > 0,
        hasMangaLists: mangaLists.length > 0,
        shouldReload: shouldReloadData()
      })

      // Force load data after successful authentication
      useStore.getState().fetchMediaLists(authUser.id, currentType, true)
        .then(() => {
          console.log('Data loading completed successfully')
        })
        .catch((error) => {
          console.error('Data loading failed:', error)
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
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [darkMode])

  console.log('Render state:', {
    authLoading,
    hasAccessToken: !!accessToken,
    hasAuthUser: !!authUser,
    hasClient: !!client
  })

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="loading-spinner w-12 h-12 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Authenticating...</p>
        </div>
      </div>
    )
  }

  if (!accessToken || !authUser) {
    console.log('Showing login screen - missing auth data')
    return <TokenLogin />
  }

  const handleSignOut = () => {
    if (confirm('Are you sure you want to sign out?')) {
      signOut()
    }
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Header */}
        <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center gap-2 sm:gap-4">
                <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
                  AniList Bulk Edit
                </h1>
                {user && (
                  <div className="hidden sm:flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <Image
                      src={user.avatar?.medium || '/default-avatar.png'}
                      alt={user.name}
                      width={24}
                      height={24}
                      className="rounded-full"
                      unoptimized={true}
                    />
                    <span>{user.name}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 sm:gap-2">
                <button
                  onClick={handleManualRefresh}
                  disabled={isManualRefreshing || isLoadingLists}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 
                                    hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Refresh your media lists"
                >
                  <RotateCcw className={`w-5 h-5 ${(isManualRefreshing || isLoadingLists) ? 'animate-spin' : ''}`} />
                </button>

                <button
                  onClick={toggleDarkMode}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 
                            hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>

                <button
                  onClick={handleSignOut}
                  className="hidden sm:flex btn-secondary text-sm items-center gap-2"
                  title="Sign out of AniList"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content with Sidebars */}
        <div className="relative">
          {/* Left Sidebar - Desktop */}
          <div
            className={`sidebar-left hidden md:block ${leftSidebarOpen ? 'open' : 'closed'}`}
          >
            <LeftSidebar onClose={toggleLeftSidebar} isOpen={leftSidebarOpen} />
          </div>

          {/* Left Edge Handle - Visible when sidebar is closed */}
          {!leftSidebarOpen && (
            <button
              onClick={toggleLeftSidebar}
              className="fixed left-0 top-1/2 -translate-y-1/2 z-50 hidden md:flex w-6 h-12 items-center justify-center bg-blue-500 hover:bg-blue-600 text-white rounded-r-full shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-110"
              aria-label="Open filters"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}

          {/* Right Sidebar - Desktop */}
          <div
            className={`sidebar-right hidden md:block ${rightSidebarOpen ? 'open' : 'closed'}`}
          >
            <BulkEditPanel client={client} onClose={toggleRightSidebar} isOpen={rightSidebarOpen} />
          </div>

          {/* Right Edge Handle - Visible when sidebar is closed */}
          {!rightSidebarOpen && (
            <button
              onClick={toggleRightSidebar}
              className="fixed right-0 top-1/2 -translate-y-1/2 z-50 hidden md:flex w-6 h-12 items-center justify-center bg-blue-500 hover:bg-blue-600 text-white rounded-l-full shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-110"
              aria-label="Open bulk edit"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}

          {/* Main Content Area */}
          <main
            className="min-h-[calc(100vh-4rem)] transition-all duration-300"
            style={{
              marginLeft: leftSidebarOpen ? '320px' : '0',
              marginRight: rightSidebarOpen ? '640px' : '0',
            }}
          >
            <div className="hidden md:block">
              <style jsx>{`
                @media (max-width: 767px) {
                  main {
                    margin-left: 0 !important;
                    margin-right: 0 !important;
                  }
                }
              `}</style>
            </div>
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              {isLoadingLists ? (
                <div className="text-center py-12">
                  <div className="loading-spinner w-8 h-8 mx-auto mb-4"></div>
                  <p className="text-gray-600 dark:text-gray-400">Loading your media lists...</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {(animeLists.length === 0 && mangaLists.length === 0) && (
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
                      <h3 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                        No Media Lists Found
                      </h3>
                      <p className="text-sm text-yellow-600 dark:text-yellow-300 mb-2">
                        Your anime and manga lists appear to be empty. This could mean:
                      </p>
                      <ul className="text-sm text-yellow-600 dark:text-yellow-300 space-y-1 mb-3 ml-4">
                        <li>• You haven&apos;t added any anime or manga to your AniList yet</li>
                        <li>• There&apos;s a connection issue preventing data loading</li>
                        <li>• Your AniList privacy settings might be blocking access</li>
                      </ul>
                      <button
                        onClick={handleManualRefresh}
                        disabled={isManualRefreshing}
                        className="btn-primary text-sm flex items-center gap-2"
                      >
                        <RotateCcw className={`w-4 h-4 ${isManualRefreshing ? 'animate-spin' : ''}`} />
                        Try Refreshing
                      </button>
                    </div>
                  )}

                  {/* Media List View */}
                  <MediaListView client={client} />
                </div>
              )}
            </div>
          </main>
        </div>

        {/* Mobile FAB */}
        <MobileFAB
          onFilterClick={() => setMobileFilterOpen(true)}
          onBulkEditClick={() => setMobileBulkEditOpen(true)}
          activeFilterCount={activeFilterCount}
          selectedCount={selectedCount}
          onSignOut={handleSignOut}
          userName={user?.name}
        />

        {/* Mobile Filter Overlay */}
        <MobileOverlay
          isOpen={mobileFilterOpen}
          onClose={() => setMobileFilterOpen(false)}
          title="Filters"
        >
          <LeftSidebar isMobile onClose={() => setMobileFilterOpen(false)} />
        </MobileOverlay>

        {/* Mobile Bulk Edit Overlay */}
        <MobileOverlay
          isOpen={mobileBulkEditOpen}
          onClose={() => setMobileBulkEditOpen(false)}
          title="Bulk Edit"
        >
          <BulkEditPanel client={client} isMobile onClose={() => setMobileBulkEditOpen(false)} />
        </MobileOverlay>

        {/* Notifications */}
        <NotificationList />
      </div>
    </Layout>
  )
} 
