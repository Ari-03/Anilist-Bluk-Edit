import { useState, useEffect } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import { useStore } from '@/store'
import { AniListClient } from '@/lib/anilist'
import { MediaType } from '@/types/anilist'
import Layout from '@/components/Layout'
import MediaListView from '@/components/MediaListView'
import BulkEditPanel from '@/components/BulkEditPanel'
import FilterPanel from '@/components/FilterPanel'
import NotificationList from '@/components/NotificationList'
import DebugPanel from '@/components/DebugPanel'
import { Loader2, LogIn, User, Settings, Moon, Sun } from 'lucide-react'

export default function Home() {
    const { data: session, status } = useSession()
    const {
        user,
        darkMode,
        currentType,
        isLoadingLists,
        setUser,
        setAccessToken,
        setAnimeLists,
        setMangaLists,
        setIsLoadingLists,
        setError,
        addNotification,
        toggleDarkMode,
    } = useStore()

    const [client, setClient] = useState<AniListClient | null>(null)

    // Initialize AniList client when session is available
    useEffect(() => {
        if (session?.accessToken) {
            const anilistClient = new AniListClient(session.accessToken)
            setClient(anilistClient)
            setAccessToken(session.accessToken)
        }
    }, [session, setAccessToken])

    // Load user data and media lists
    useEffect(() => {
        const loadUserData = async () => {
            if (!client || !session?.accessToken) {
                console.log('No client or session, skipping load')
                return
            }

            console.log('Loading user data...', { hasUser: !!user })

            try {
                setIsLoadingLists(true)

                // Get current user
                const userData = await client.getCurrentUser()
                console.log('Got user data:', userData.name)
                setUser(userData)

                // Load both anime and manga lists
                const [animeLists, mangaLists] = await Promise.all([
                    client.getAllMediaLists(userData.id, MediaType.ANIME),
                    client.getAllMediaLists(userData.id, MediaType.MANGA),
                ])

                console.log('Loaded lists:', { anime: animeLists.length, manga: mangaLists.length })
                setAnimeLists(animeLists)
                setMangaLists(mangaLists)

                addNotification({
                    type: 'success',
                    message: `Welcome back, ${userData.name}! Loaded ${animeLists.length} anime and ${mangaLists.length} manga entries.`,
                })
            } catch (error) {
                console.error('Failed to load user data:', error)
                setError(error instanceof Error ? error.message : 'Failed to load user data')
                addNotification({
                    type: 'error',
                    message: 'Failed to load your media lists. Please try refreshing the page.',
                })
            } finally {
                setIsLoadingLists(false)
            }
        }

        loadUserData()
    }, [client, session?.accessToken])

    // Apply dark mode class to document
    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark')
        } else {
            document.documentElement.classList.remove('dark')
        }
    }, [darkMode])

    if (status === 'loading') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="text-center">
                    <div className="loading-spinner w-12 h-12 mx-auto mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-400">Loading...</p>
                </div>
            </div>
        )
    }

    if (!session) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
                <div className="min-h-screen flex items-center justify-center px-4">
                    <div className="max-w-md w-full">
                        <div className="text-center mb-8">
                            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <User className="w-10 h-10 text-white" />
                            </div>
                            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                                AniList Bulk Edit
                            </h1>
                            <p className="text-gray-600 dark:text-gray-400">
                                Efficiently manage your anime and manga lists with powerful bulk editing tools
                            </p>
                        </div>

                        <div className="card p-8">
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6 text-center">
                                Sign in to get started
                            </h2>

                            <button
                                onClick={() => signIn('anilist')}
                                className="w-full anilist-blue text-white font-medium py-3 px-4 rounded-lg 
                          hover:bg-opacity-90 transition-all duration-200 
                          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50
                          flex items-center justify-center gap-2"
                            >
                                <LogIn className="w-5 h-5" />
                                Sign in with AniList
                            </button>

                            <div className="mt-6 text-center">
                                <button
                                    onClick={toggleDarkMode}
                                    className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 
                            hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                                >
                                    {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                                    {darkMode ? 'Light mode' : 'Dark mode'}
                                </button>
                            </div>
                        </div>

                        <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
                            <p>
                                Don't have an AniList account?{' '}
                                <a
                                    href="https://anilist.co/signup"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                    Sign up here
                                </a>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <Layout>
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
                {/* Header */}
                <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex justify-between items-center h-16">
                            <div className="flex items-center gap-4">
                                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                                    AniList Bulk Edit
                                </h1>
                                {user && (
                                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                        <img
                                            src={user.avatar?.medium || '/default-avatar.png'}
                                            alt={user.name}
                                            className="w-6 h-6 rounded-full"
                                        />
                                        <span>{user.name}</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={toggleDarkMode}
                                    className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 
                            hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                    title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                                >
                                    {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                                </button>

                                <button
                                    onClick={() => signOut()}
                                    className="btn-secondary text-sm"
                                >
                                    Sign out
                                </button>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    {isLoadingLists ? (
                        <div className="text-center py-12">
                            <div className="loading-spinner w-8 h-8 mx-auto mb-4"></div>
                            <p className="text-gray-600 dark:text-gray-400">Loading your media lists...</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Debug Panel */}
                            <DebugPanel />

                            {/* Filter Panel */}
                            <FilterPanel />

                            {/* Bulk Edit Panel */}
                            <BulkEditPanel client={client} />

                            {/* Media List View */}
                            <MediaListView client={client} />
                        </div>
                    )}
                </main>

                {/* Notifications */}
                <NotificationList />
            </div>
        </Layout>
    )
} 