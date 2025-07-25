import { useState, useEffect } from 'react'
import Image from 'next/image'
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
import { Loader2, LogIn, LogOut, User, Moon, Sun } from 'lucide-react'

export default function Home() {
    const { user: authUser, accessToken, isLoading: authLoading, signOut } = useAuth()
    const {
        user,
        darkMode,
        currentType,
        isLoadingLists,
        animeLists,
        mangaLists,
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
    } = useStore()

    const [client, setClient] = useState<AniListClient | null>(null)

    // Initialize AniList client when access token is available
    useEffect(() => {
        console.log('Access token changed:', { 
            hasToken: !!accessToken, 
            tokenLength: accessToken?.length,
            hasAuthUser: !!authUser 
        })
        
        if (accessToken) {
            const anilistClient = new AniListClient(accessToken)
            setClient(anilistClient)
            setAccessToken(accessToken)
            console.log('AniList client initialized successfully')
        } else {
            setClient(null)
            console.log('No access token - client cleared')
        }
    }, [accessToken, setAccessToken])

    // Load user data and media lists
    useEffect(() => {
        if (client && authUser) {
            useStore.getState().fetchMediaLists(authUser.id, currentType)
        }
    }, [client, authUser, currentType])

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
                                        <Image
                                            src={user.avatar?.medium || '/default-avatar.png'}
                                            alt={user.name}
                                            width={24}
                                            height={24}
                                            className="rounded-full"
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
                                    onClick={() => {
                                        if (confirm('Are you sure you want to sign out?')) {
                                            signOut()
                                        }
                                    }}
                                    className="btn-secondary text-sm flex items-center gap-2"
                                    title="Sign out of AniList"
                                >
                                    <LogOut className="w-4 h-4" />
                                    Sign out
                                </button>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Main Content with Sidebar Layout */}
                <div className="flex h-[calc(100vh-4rem)]">
                    {/* Left Sidebar */}
                    <LeftSidebar />

                    {/* Main Content Area */}
                    <main className="flex-1 overflow-auto">
                        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                            {isLoadingLists ? (
                                <div className="text-center py-12">
                                    <div className="loading-spinner w-8 h-8 mx-auto mb-4"></div>
                                    <p className="text-gray-600 dark:text-gray-400">Loading your media lists...</p>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {/* Debug Panel
                                    <DebugPanel /> */}

                                    {/* Bulk Edit Panel */}
                                    <BulkEditPanel client={client} />

                                    {/* Media List View */}
                                    <MediaListView client={client} />
                                </div>
                            )}
                        </div>
                    </main>
                </div>

                {/* Notifications */}
                <NotificationList />
            </div>
        </Layout>
    )
} 