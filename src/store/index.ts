import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import {
    User,
    MediaList,
    MediaType,
    MediaListStatus
} from '@/types/anilist'

// Bulk edit types
export interface BulkEditOptions {
    status?: MediaListStatus
    score?: number
    progress?: number
    progressVolumes?: number
    repeat?: number
    priority?: number
    private?: boolean
    notes?: string
    hiddenFromStatusLists?: boolean
    customLists?: string[]
    advancedScores?: Record<string, number>
    startedAt?: { year?: number; month?: number; day?: number }
    completedAt?: { year?: number; month?: number; day?: number }
}

export interface FilterOptions {
    status?: MediaListStatus[]
    format?: string[]
    genre?: string[]
    country?: string[]
    year?: { start?: number; end?: number }
    score?: { min?: number; max?: number }
    search?: string
    sortBy?: 'title' | 'score' | 'progress' | 'startDate' | 'updatedAt'
    sortOrder?: 'asc' | 'desc'
}

interface AppState {
    // User data
    user: User | null
    accessToken: string | null

    // Media lists
    animeLists: MediaList[]
    mangaLists: MediaList[]
    isLoadingLists: boolean
    lastDataLoad: number | null // Timestamp of last successful data load

    // Current view
    currentType: MediaType
    currentStatus: MediaListStatus | 'ALL'
    viewMode: 'grid' | 'list'

    // Bulk edit
    selectedEntries: Set<number>
    bulkEditMode: boolean
    bulkEditOptions: BulkEditOptions | null

    // Filters and search
    filters: FilterOptions
    filteredEntries: MediaList[]

    // UI state
    isLoading: boolean
    error: string | null
    notifications: Array<{
        id: string
        type: 'success' | 'error' | 'warning' | 'info'
        message: string
        timestamp: number
    }>

    // Theme
    darkMode: boolean
}

interface AppActions {
    // User actions
    setUser: (user: User | null) => void
    setAccessToken: (token: string | null) => void
    logout: () => void

    // Media list actions
    setAnimeLists: (lists: MediaList[]) => void
    setMangaLists: (lists: MediaList[]) => void
    updateMediaListEntry: (entry: MediaList) => void
    removeMediaListEntry: (id: number) => void
    setIsLoadingLists: (loading: boolean) => void
    setLastDataLoad: (timestamp: number) => void
    shouldReloadData: () => boolean

    // View actions
    setCurrentType: (type: MediaType) => void
    setCurrentStatus: (status: MediaListStatus | 'ALL') => void
    setViewMode: (mode: 'grid' | 'list') => void

    // Bulk edit actions
    toggleEntrySelection: (entryId: number) => void
    selectAllEntries: () => void
    clearSelection: () => void
    setBulkEditMode: (enabled: boolean) => void
    setBulkEditOptions: (options: BulkEditOptions | null) => void

    // Filter actions
    setFilters: (filters: Partial<FilterOptions>) => void
    clearFilters: () => void
    applyFilters: () => void

    // UI actions
    setLoading: (loading: boolean) => void
    setError: (error: string | null) => void
    addNotification: (notification: Omit<AppState['notifications'][0], 'id' | 'timestamp'>) => void
    removeNotification: (id: string) => void
    clearNotifications: () => void
    toggleDarkMode: () => void

    // Utility actions
    getCurrentLists: () => MediaList[]
    getSelectedEntries: () => MediaList[]
}

const initialState: AppState = {
    user: null,
    accessToken: null,
    animeLists: [],
    mangaLists: [],
    isLoadingLists: false,
    lastDataLoad: null,
    currentType: MediaType.ANIME,
    currentStatus: 'ALL',
    viewMode: 'grid',
    selectedEntries: new Set(),
    bulkEditMode: false,
    bulkEditOptions: null,
    filters: {
        sortBy: 'title',
        sortOrder: 'asc'
    },
    filteredEntries: [],
    isLoading: false,
    error: null,
    notifications: [],
    darkMode: false,
}

export const useStore = create<AppState & AppActions>()(
    devtools(
        persist(
            (set, get) => ({
                ...initialState,

                // User actions
                setUser: (user) => set({ user }),
                setAccessToken: (accessToken) => set({ accessToken }),
                logout: () => set({
                    user: null,
                    accessToken: null,
                    animeLists: [],
                    mangaLists: [],
                    lastDataLoad: null,
                    selectedEntries: new Set(),
                    bulkEditMode: false,
                    bulkEditOptions: null,
                    filteredEntries: [] // Reset filtered entries
                }),

                // Media list actions
                setAnimeLists: (animeLists) => {
                    console.log('Setting anime lists:', animeLists.length, 'entries')

                    // Check for duplicates in source data
                    const ids = animeLists.map(entry => entry.id)
                    const uniqueIds = new Set(ids)
                    if (ids.length !== uniqueIds.size) {
                        console.warn('🚨 Duplicate anime entries detected in source data')
                        const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index)
                        console.warn('Duplicate anime IDs:', duplicateIds)
                    }

                    set({ animeLists })
                    // Apply filters immediately after state update
                    get().applyFilters()
                },
                setMangaLists: (mangaLists) => {
                    console.log('Setting manga lists:', mangaLists.length, 'entries')

                    // Check for duplicates in source data
                    const ids = mangaLists.map(entry => entry.id)
                    const uniqueIds = new Set(ids)
                    if (ids.length !== uniqueIds.size) {
                        console.warn('🚨 Duplicate manga entries detected in source data')
                        const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index)
                        console.warn('Duplicate manga IDs:', duplicateIds)
                    }

                    set({ mangaLists })
                    // Apply filters immediately after state update
                    get().applyFilters()
                },
                updateMediaListEntry: (updatedEntry) => {
                    const state = get()
                    const isAnime = updatedEntry.media?.type === MediaType.ANIME

                    if (isAnime) {
                        const animeLists = state.animeLists.map(entry =>
                            entry.id === updatedEntry.id ? updatedEntry : entry
                        )
                        set({ animeLists })
                    } else {
                        const mangaLists = state.mangaLists.map(entry =>
                            entry.id === updatedEntry.id ? updatedEntry : entry
                        )
                        set({ mangaLists })
                    }

                    get().applyFilters()
                },
                removeMediaListEntry: (id) => {
                    const state = get()
                    const animeLists = state.animeLists.filter(entry => entry.id !== id)
                    const mangaLists = state.mangaLists.filter(entry => entry.id !== id)
                    const selectedEntries = new Set(state.selectedEntries)
                    selectedEntries.delete(id)

                    set({ animeLists, mangaLists, selectedEntries })
                    get().applyFilters()
                },
                setIsLoadingLists: (isLoadingLists) => set({ isLoadingLists }),
                setLastDataLoad: (lastDataLoad) => set({ lastDataLoad }),
                shouldReloadData: () => {
                    const state = get()
                    // Check if we have data in current session and if it's fresh
                    const hasDataInMemory = state.animeLists.length > 0 && state.mangaLists.length > 0
                    const hasTimestamp = state.lastDataLoad !== null

                    if (hasDataInMemory && hasTimestamp) {
                        const fiveMinutes = 5 * 60 * 1000 // Reduced from 1 hour to 5 minutes for better UX
                        const isDataFresh = Date.now() - state.lastDataLoad! < fiveMinutes
                        console.log('shouldReloadData check:', {
                            hasDataInMemory,
                            hasTimestamp,
                            lastDataLoad: state.lastDataLoad,
                            isDataFresh,
                            timeSinceLoad: state.lastDataLoad ? Date.now() - state.lastDataLoad : 'never'
                        })
                        return !isDataFresh
                    }

                    console.log('shouldReloadData: true (no data or timestamp)', {
                        hasDataInMemory,
                        hasTimestamp
                    })
                    return true
                },

                // View actions
                setCurrentType: (currentType) => {
                    console.log('Setting current type to:', currentType)
                    set({
                        currentType,
                        selectedEntries: new Set(),
                        currentStatus: 'ALL' // Reset status when switching types
                    })
                    // Apply filters immediately after state update
                    get().applyFilters()
                },
                setCurrentStatus: (currentStatus) => {
                    console.log('Setting current status to:', currentStatus)
                    set({ currentStatus, selectedEntries: new Set() })
                    // Apply filters immediately after state update
                    get().applyFilters()
                },
                setViewMode: (viewMode) => {
                    console.log('Setting view mode to:', viewMode)
                    set({ viewMode })
                },

                // Bulk edit actions
                toggleEntrySelection: (entryId) => {
                    const selectedEntries = new Set(get().selectedEntries)
                    if (selectedEntries.has(entryId)) {
                        selectedEntries.delete(entryId)
                    } else {
                        selectedEntries.add(entryId)
                    }
                    set({ selectedEntries })
                },
                selectAllEntries: () => {
                    const filteredEntries = get().filteredEntries
                    const selectedEntries = new Set(filteredEntries.map(entry => entry.id))
                    set({ selectedEntries })
                },
                clearSelection: () => set({ selectedEntries: new Set() }),
                setBulkEditMode: (bulkEditMode) => {
                    set({ bulkEditMode })
                    if (!bulkEditMode) {
                        set({ selectedEntries: new Set(), bulkEditOptions: null })
                    }
                },
                setBulkEditOptions: (bulkEditOptions) => set({ bulkEditOptions }),

                // Filter actions
                setFilters: (newFilters) => {
                    const currentFilters = get().filters
                    const filters = { ...currentFilters, ...newFilters }
                    set({ filters })
                    get().applyFilters()
                },
                clearFilters: () => {
                    set({ filters: initialState.filters })
                    get().applyFilters()
                },
                applyFilters: () => {
                    const state = get()
                    const { filters, currentType, currentStatus } = state
                    let lists = state.getCurrentLists()

                    console.log('=== applyFilters START ===')
                    console.log('Applying filters:', {
                        currentType,
                        currentStatus,
                        totalLists: lists.length,
                        filters,
                        sortBy: filters.sortBy || 'title',
                        sortOrder: filters.sortOrder || 'asc',
                        listsPreview: lists.slice(0, 2).map(e => ({
                            id: e.id,
                            title: e.media?.title?.userPreferred,
                            status: e.status
                        }))
                    })

                    // Filter by currentStatus first (this is from the status tabs)
                    if (currentStatus !== 'ALL') {
                        const beforeLength = lists.length
                        lists = lists.filter(entry => entry.status === currentStatus)
                        console.log(`After status filter (${currentStatus}): ${beforeLength} -> ${lists.length} entries`)
                    }

                    // Apply additional status filters from FilterPanel (only if currentStatus is 'ALL')
                    if (currentStatus === 'ALL' && filters.status && filters.status.length > 0) {
                        lists = lists.filter(entry =>
                            entry.status && filters.status!.includes(entry.status)
                        )
                        console.log('After FilterPanel status filter:', lists.length, 'entries')
                    }

                    if (filters.format && filters.format.length > 0) {
                        lists = lists.filter(entry =>
                            entry.media?.format && filters.format!.includes(entry.media.format)
                        )
                    }

                    if (filters.genre && filters.genre.length > 0) {
                        lists = lists.filter(entry =>
                            entry.media?.genres?.some(genre => filters.genre!.includes(genre))
                        )
                    }

                    if (filters.country && filters.country.length > 0) {
                        lists = lists.filter(entry => {
                            const country = entry.media?.countryOfOrigin
                            if (!country) return false
                            return filters.country!.includes(country)
                        })
                    }

                    if (filters.year) {
                        lists = lists.filter(entry => {
                            const year = entry.media?.startDate?.year || entry.media?.seasonYear
                            if (!year) return false
                            if (filters.year!.start && year < filters.year!.start) return false
                            if (filters.year!.end && year > filters.year!.end) return false
                            return true
                        })
                    }

                    if (filters.country && filters.country.length > 0) {
                        lists = lists.filter(entry => {
                            const country = entry.media?.countryOfOrigin
                            if (!country) return false
                            return filters.country!.includes(country)
                        })
                    }

                    if (filters.score) {
                        lists = lists.filter(entry => {
                            const score = entry.score || 0
                            if (filters.score!.min && score < filters.score!.min) return false
                            if (filters.score!.max && score > filters.score!.max) return false
                            return true
                        })
                    }

                    if (filters.search) {
                        const searchLower = filters.search.toLowerCase()
                        lists = lists.filter(entry => {
                            const title = entry.media?.title
                            return (
                                title?.romaji?.toLowerCase().includes(searchLower) ||
                                title?.english?.toLowerCase().includes(searchLower) ||
                                title?.native?.toLowerCase().includes(searchLower) ||
                                title?.userPreferred?.toLowerCase().includes(searchLower)
                            )
                        })
                    }

                    // Apply sorting with special handling for 'ALL' status
                    if (currentStatus === 'ALL') {
                        // Define status order: Watching, Planning, Completed, Dropped, Paused, Rewatching
                        const statusOrder = {
                            [MediaListStatus.CURRENT]: 0,     // Watching
                            [MediaListStatus.PLANNING]: 1,    // Planning
                            [MediaListStatus.COMPLETED]: 2,   // Completed
                            [MediaListStatus.DROPPED]: 3,     // Dropped
                            [MediaListStatus.PAUSED]: 4,      // Paused
                            [MediaListStatus.REPEATING]: 5,   // Rewatching
                        }

                        lists.sort((a, b) => {
                            // First, sort by status
                            const aStatusOrder = statusOrder[a.status as MediaListStatus] ?? 999
                            const bStatusOrder = statusOrder[b.status as MediaListStatus] ?? 999

                            if (aStatusOrder !== bStatusOrder) {
                                return aStatusOrder - bStatusOrder
                            }

                            // Within same status, sort by the selected criteria
                            const sortBy = filters.sortBy || 'title'
                            const sortOrder = filters.sortOrder || 'asc'
                            if (sortBy) {
                                let aValue: any, bValue: any

                                switch (sortBy) {
                                    case 'title':
                                        aValue = a.media?.title?.userPreferred || a.media?.title?.romaji || ''
                                        bValue = b.media?.title?.userPreferred || b.media?.title?.romaji || ''
                                        break
                                    case 'score':
                                        aValue = a.score || 0
                                        bValue = b.score || 0
                                        break
                                    case 'progress':
                                        aValue = a.progress || 0
                                        bValue = b.progress || 0
                                        break
                                    case 'startDate':
                                        aValue = a.startedAt?.year || 0
                                        bValue = b.startedAt?.year || 0
                                        break
                                    case 'updatedAt':
                                        aValue = a.updatedAt || 0
                                        bValue = b.updatedAt || 0
                                        break
                                    default:
                                        return 0
                                }

                                if (typeof aValue === 'string') {
                                    const comparison = aValue.localeCompare(bValue)
                                    return sortOrder === 'desc' ? -comparison : comparison
                                } else {
                                    const comparison = aValue - bValue
                                    // If sorting by score and scores are equal, sort alphabetically by title
                                    if (sortBy === 'score' && comparison === 0) {
                                        const aTitle = a.media?.title?.userPreferred || a.media?.title?.romaji || ''
                                        const bTitle = b.media?.title?.userPreferred || b.media?.title?.romaji || ''
                                        return aTitle.localeCompare(bTitle)
                                    }
                                    return sortOrder === 'desc' ? -comparison : comparison
                                }
                            }

                            return 0
                        })
                    } else {
                        // Regular sorting for specific status views
                        const sortBy = filters.sortBy || 'title'
                        const sortOrder = filters.sortOrder || 'asc'
                        if (sortBy) {
                            lists.sort((a, b) => {
                                let aValue: any, bValue: any

                                switch (sortBy) {
                                    case 'title':
                                        aValue = a.media?.title?.userPreferred || a.media?.title?.romaji || ''
                                        bValue = b.media?.title?.userPreferred || b.media?.title?.romaji || ''
                                        break
                                    case 'score':
                                        aValue = a.score || 0
                                        bValue = b.score || 0
                                        break
                                    case 'progress':
                                        aValue = a.progress || 0
                                        bValue = b.progress || 0
                                        break
                                    case 'startDate':
                                        aValue = a.startedAt?.year || 0
                                        bValue = b.startedAt?.year || 0
                                        break
                                    case 'updatedAt':
                                        aValue = a.updatedAt || 0
                                        bValue = b.updatedAt || 0
                                        break
                                    default:
                                        return 0
                                }

                                if (typeof aValue === 'string') {
                                    const comparison = aValue.localeCompare(bValue)
                                    return sortOrder === 'desc' ? -comparison : comparison
                                } else {
                                    const comparison = aValue - bValue
                                    // If sorting by score and scores are equal, sort alphabetically by title
                                    if (sortBy === 'score' && comparison === 0) {
                                        const aTitle = a.media?.title?.userPreferred || a.media?.title?.romaji || ''
                                        const bTitle = b.media?.title?.userPreferred || b.media?.title?.romaji || ''
                                        return aTitle.localeCompare(bTitle)
                                    }
                                    return sortOrder === 'desc' ? -comparison : comparison
                                }
                            })
                        }
                    }

                    // Check for and remove duplicates before setting filteredEntries
                    const duplicateCheck = new Map()
                    const duplicates: number[] = []
                    lists.forEach(entry => {
                        if (duplicateCheck.has(entry.id)) {
                            duplicates.push(entry.id)
                        } else {
                            duplicateCheck.set(entry.id, entry)
                        }
                    })

                    if (duplicates.length > 0) {
                        console.warn('🚨 Found duplicate entries with IDs:', duplicates)
                        // Remove duplicates by using Map to keep only unique entries by ID
                        const uniqueMap = new Map()
                        lists.forEach(entry => {
                            uniqueMap.set(entry.id, entry)
                        })
                        lists = Array.from(uniqueMap.values())
                        console.log('✅ Removed duplicates, new count:', lists.length)
                    }

                    console.log('Final filtered entries:', lists.length)
                    console.log('Final entries preview:', lists.slice(0, 3).map(e => ({
                        id: e.id,
                        title: e.media?.title?.userPreferred,
                        status: e.status
                    })))
                    console.log('=== applyFilters END ===')
                    set({ filteredEntries: lists })
                },

                // UI actions
                setLoading: (isLoading) => set({ isLoading }),
                setError: (error) => set({ error }),
                addNotification: (notification) => {
                    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9)
                    const newNotification = {
                        ...notification,
                        id,
                        timestamp: Date.now()
                    }
                    set(state => ({
                        notifications: [...state.notifications, newNotification]
                    }))

                    // Auto-remove notification after 5 seconds
                    setTimeout(() => {
                        get().removeNotification(id)
                    }, 5000)
                },
                removeNotification: (id) => {
                    set(state => ({
                        notifications: state.notifications.filter(n => n.id !== id)
                    }))
                },
                clearNotifications: () => set({ notifications: [] }),
                toggleDarkMode: () => set(state => ({ darkMode: !state.darkMode })),

                // Utility actions
                getCurrentLists: () => {
                    const state = get()
                    return state.currentType === MediaType.ANIME
                        ? state.animeLists
                        : state.mangaLists
                },
                getSelectedEntries: () => {
                    const state = get()
                    const currentLists = state.getCurrentLists()
                    return currentLists.filter(entry => state.selectedEntries.has(entry.id))
                },
            }),
            {
                name: 'anilist-bulk-edit-store',
                partialize: (state) => ({
                    // Only persist essential data to avoid quota exceeded errors
                    user: state.user,
                    accessToken: state.accessToken,
                    darkMode: state.darkMode,
                    currentType: state.currentType,
                    filters: state.filters,
                    lastDataLoad: state.lastDataLoad,
                    // Don't persist large arrays to avoid localStorage quota issues
                }),
            }
        ),
        {
            name: 'anilist-bulk-edit-store',
        }
    )
) 