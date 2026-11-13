import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import {
    User,
    MediaList,
    MediaType,
    MediaListStatus
} from '@/types/anilist'
import { AniListClient } from '@/lib/anilist'
import { AniListRequestError } from '@/lib/graphql'

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

// Helper type for sorted indices
interface SortedIndices {
    byYear: number[]  // indices sorted by year
    byScore: number[] // indices sorted by score
}

export interface StoredAccount {
    user: User
    accessToken: string
    addedAt: number
}

interface AppState {
    // User data
    user: User | null
    accessToken: string | null

    // Multi-account registry, the only persisted copy of tokens.
    // `user`/`accessToken` mirror the active account (see upsertAccount).
    accounts: Record<number, StoredAccount>
    activeAccountId: number | null

    // Media lists
    animeLists: MediaList[]
    mangaLists: MediaList[]
    isLoadingLists: boolean
    lastDataLoad: number | null // When the in-memory lists were loaded (not persisted, like the lists)

    // Performance optimization: pre-sorted indices for fast range queries
    animeSortedIndices: SortedIndices | null
    mangaSortedIndices: SortedIndices | null

    // Current view
    currentType: MediaType
    currentStatus: MediaListStatus | 'ALL'
    viewMode: 'grid' | 'list'
    // Collapsed accordion status sections, per media type
    collapsedStatusSections: Record<MediaType, MediaListStatus[]>

    // Bulk edit
    selectedEntries: Set<number>
    bulkEditMode: boolean
    bulkEditOptions: BulkEditOptions | null

    // Per-entry mutation sync state (transient, not persisted)
    entrySync: Record<number, 'pending' | 'error'>

    // Filters and search
    filters: FilterOptions
    filteredEntries: MediaList[]
    showHiddenFromStatusLists: boolean

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
    upsertAccount: (user: User, accessToken: string) => void
    removeAccount: (id: number) => void
    logout: () => void

    // Media list actions
    setAnimeLists: (lists: MediaList[]) => void
    setMangaLists: (lists: MediaList[]) => void
    updateMediaListEntry: (entry: MediaList) => void
    mergeMediaListEntries: (partials: Array<Partial<MediaList> & { id: number }>) => void
    removeMediaListEntry: (id: number) => void
    removeMediaListEntries: (ids: number[]) => void
    setIsLoadingLists: (loading: boolean) => void
    setLastDataLoad: (timestamp: number) => void
    shouldReloadData: () => boolean
    fetchMediaLists: (userId: number, type: MediaType, force?: boolean) => Promise<void>

    // View actions
    setCurrentType: (type: MediaType) => void
    setCurrentStatus: (status: MediaListStatus | 'ALL') => void
    setViewMode: (mode: 'grid' | 'list') => void
    toggleStatusSection: (type: MediaType, status: MediaListStatus) => void

    // Bulk edit actions
    toggleEntrySelection: (entryId: number) => void
    selectEntries: (ids: number[]) => void
    selectAllEntries: () => void
    clearSelection: () => void
    deselectEntries: (ids: number[]) => void
    setBulkEditMode: (enabled: boolean) => void
    setBulkEditOptions: (options: BulkEditOptions | null) => void
    setEntrySync: (ids: number[], syncState: 'pending' | 'error' | null) => void
    clearEntrySync: () => void

    // Filter actions
    setFilters: (filters: Partial<FilterOptions>) => void
    clearFilters: () => void
    applyFilters: () => void
    setShowHiddenFromStatusLists: (show: boolean) => void

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

// Binary search helpers for optimized range queries
const binarySearchLowerBound = (arr: number[], target: number, getValue: (idx: number) => number): number => {
    let left = 0
    let right = arr.length
    while (left < right) {
        const mid = Math.floor((left + right) / 2)
        if (getValue(arr[mid]) < target) {
            left = mid + 1
        } else {
            right = mid
        }
    }
    return left
}

const binarySearchUpperBound = (arr: number[], target: number, getValue: (idx: number) => number): number => {
    let left = 0
    let right = arr.length
    while (left < right) {
        const mid = Math.floor((left + right) / 2)
        if (getValue(arr[mid]) <= target) {
            left = mid + 1
        } else {
            right = mid
        }
    }
    return left
}

// Create sorted indices for fast range queries
const createSortedIndices = (lists: MediaList[]): SortedIndices => {
    // Create array of indices [0, 1, 2, ...]
    const indices = lists.map((_, idx) => idx)

    // Sort by year
    const byYear = [...indices].sort((a, b) => {
        const yearA = lists[a].media?.startDate?.year || lists[a].media?.seasonYear || 0
        const yearB = lists[b].media?.startDate?.year || lists[b].media?.seasonYear || 0
        return yearA - yearB
    })

    // Sort by score
    const byScore = [...indices].sort((a, b) => {
        const scoreA = lists[a].score || 0
        const scoreB = lists[b].score || 0
        return scoreA - scoreB
    })

    return { byYear, byScore }
}

const initialState: AppState = {
    user: null,
    accessToken: null,
    accounts: {},
    activeAccountId: null,
    animeLists: [],
    mangaLists: [],
    isLoadingLists: false,
    lastDataLoad: null,
    animeSortedIndices: null,
    mangaSortedIndices: null,
    currentType: MediaType.ANIME,
    currentStatus: 'ALL',
    viewMode: 'grid',
    collapsedStatusSections: {
        [MediaType.ANIME]: [],
        [MediaType.MANGA]: [],
    },
    selectedEntries: new Set(),
    bulkEditMode: false,
    bulkEditOptions: null,
    entrySync: {},
    filters: {
        sortBy: 'title',
        sortOrder: 'asc'
    },
    filteredEntries: [],
    showHiddenFromStatusLists: false,
    isLoading: false,
    error: null,
    notifications: [],
    darkMode: true, // dark-first; persisted preference wins for returning users
}

export const useStore = create<AppState & AppActions>()(
    devtools(
        persist(
            (set, get) => ({
                ...initialState,

                // User actions
                setUser: (user) => set({ user }),
                // Register (or refresh) an account and make it active. Switching
                // accounts clears all per-account data so nothing bleeds through.
                upsertAccount: (user, accessToken) => {
                    const state = get()
                    const switching = state.activeAccountId !== null && state.activeAccountId !== user.id
                    set({
                        accounts: {
                            ...state.accounts,
                            [user.id]: {
                                user,
                                accessToken,
                                addedAt: state.accounts[user.id]?.addedAt ?? Date.now()
                            }
                        },
                        activeAccountId: user.id,
                        user,
                        accessToken,
                        ...(switching ? {
                            animeLists: [],
                            mangaLists: [],
                            filteredEntries: [],
                            selectedEntries: new Set<number>(),
                            lastDataLoad: null,
                            animeSortedIndices: null,
                            mangaSortedIndices: null,
                            bulkEditMode: false,
                            bulkEditOptions: null,
                            entrySync: {},
                        } : {})
                    })
                    if (switching) get().applyFilters()
                },
                removeAccount: (id) => {
                    set(state => {
                        const accounts = { ...state.accounts }
                        delete accounts[id]
                        return { accounts }
                    })
                },
                logout: () => set({
                    user: null,
                    accessToken: null,
                    accounts: {},
                    activeAccountId: null,
                    animeLists: [],
                    mangaLists: [],
                    lastDataLoad: null,
                    selectedEntries: new Set(),
                    bulkEditMode: false,
                    bulkEditOptions: null,
                    entrySync: {},
                    filteredEntries: [] // Reset filtered entries
                }),

                // Media list actions
                setAnimeLists: (animeLists) => {

                    // De-duplicate lists before storing to prevent issues
                    const uniqueMap = new Map<number, MediaList>()
                    animeLists.forEach(entry => {
                        if (!uniqueMap.has(entry.id)) {
                            uniqueMap.set(entry.id, entry)
                        }
                    })
                    const uniqueAnimeLists = Array.from(uniqueMap.values())

                    // Create sorted indices for performance optimization
                    const animeSortedIndices = createSortedIndices(uniqueAnimeLists)

                    set({ animeLists: uniqueAnimeLists, animeSortedIndices })
                    // Apply filters immediately after state update
                    get().applyFilters()
                },
                setMangaLists: (mangaLists) => {

                    // De-duplicate lists before storing
                    const uniqueMap = new Map<number, MediaList>()
                    mangaLists.forEach(entry => {
                        if (!uniqueMap.has(entry.id)) {
                            uniqueMap.set(entry.id, entry)
                        }
                    })
                    const uniqueMangaLists = Array.from(uniqueMap.values())

                    // Create sorted indices for performance optimization
                    const mangaSortedIndices = createSortedIndices(uniqueMangaLists)

                    set({ mangaLists: uniqueMangaLists, mangaSortedIndices })
                    // Apply filters immediately after state update
                    get().applyFilters()
                },
                updateMediaListEntry: (updatedEntry) => {
                    get().mergeMediaListEntries([updatedEntry])
                },
                // Merge partial mutation results onto existing entries in one pass.
                // Mutation responses are thin (no full media object), so the rich
                // `media` already in the store is always preserved.
                mergeMediaListEntries: (partials) => {
                    if (partials.length === 0) return
                    const state = get()
                    const byId = new Map(partials.map(p => [p.id, p]))

                    let animeChanged = false
                    let mangaChanged = false

                    const animeLists = state.animeLists.map(entry => {
                        const partial = byId.get(entry.id)
                        if (!partial) return entry
                        animeChanged = true
                        return { ...entry, ...partial, media: entry.media }
                    })
                    const mangaLists = state.mangaLists.map(entry => {
                        const partial = byId.get(entry.id)
                        if (!partial) return entry
                        mangaChanged = true
                        return { ...entry, ...partial, media: entry.media }
                    })

                    if (!animeChanged && !mangaChanged) return

                    set({
                        ...(animeChanged ? { animeLists, animeSortedIndices: createSortedIndices(animeLists) } : {}),
                        ...(mangaChanged ? { mangaLists, mangaSortedIndices: createSortedIndices(mangaLists) } : {}),
                    })
                    get().applyFilters()
                },
                removeMediaListEntry: (id) => {
                    get().removeMediaListEntries([id])
                },
                removeMediaListEntries: (ids) => {
                    if (ids.length === 0) return
                    const idSet = new Set(ids)
                    const state = get()
                    const animeLists = state.animeLists.filter(entry => !idSet.has(entry.id))
                    const mangaLists = state.mangaLists.filter(entry => !idSet.has(entry.id))
                    const selectedEntries = new Set(state.selectedEntries)
                    ids.forEach(id => selectedEntries.delete(id))

                    set({
                        animeLists,
                        mangaLists,
                        selectedEntries,
                        animeSortedIndices: createSortedIndices(animeLists),
                        mangaSortedIndices: createSortedIndices(mangaLists)
                    })
                    get().applyFilters()
                },
                setIsLoadingLists: (isLoadingLists) => set({ isLoadingLists }),
                setLastDataLoad: (lastDataLoad) => set({ lastDataLoad }),
                // An empty list is valid data, so freshness is the timestamp alone
                shouldReloadData: () => {
                    const { lastDataLoad } = get()
                    const fiveMinutes = 5 * 60 * 1000
                    return lastDataLoad === null || Date.now() - lastDataLoad > fiveMinutes
                },

                // Loads both collections (the type toggle needs both). Results for
                // an account that is no longer active are dropped.
                fetchMediaLists: async (userId, _type, force = false) => {
                    const state = get()
                    if (!force && !state.shouldReloadData()) {
                        return
                    }

                    const { accessToken, activeAccountId } = state
                    if (!accessToken) {
                        get().addNotification({
                            type: 'error',
                            message: 'Authentication required. Please sign in again.',
                        })
                        return
                    }

                    set({ isLoadingLists: true, error: null })
                    const stillActive = () => get().activeAccountId === activeAccountId

                    try {
                        const client = new AniListClient(accessToken)
                        const [animeListsData, mangaListsData] = await Promise.all([
                            client.getAllMediaLists(userId, MediaType.ANIME),
                            client.getAllMediaLists(userId, MediaType.MANGA),
                        ])
                        if (!stillActive()) return

                        set({
                            animeLists: animeListsData,
                            mangaLists: mangaListsData,
                            animeSortedIndices: createSortedIndices(animeListsData),
                            mangaSortedIndices: createSortedIndices(mangaListsData),
                            lastDataLoad: Date.now(),
                            isLoadingLists: false,
                            error: null
                        })
                        get().applyFilters()
                    } catch (error) {
                        if (!stillActive()) return
                        console.error('Failed to fetch media lists:', error)

                        const status = error instanceof AniListRequestError ? error.status : undefined
                        let errorMessage = 'Failed to load your media lists.'
                        if (status === 401 || status === 400) {
                            errorMessage = 'Authentication expired. Please sign in again.'
                        } else if (status === 429) {
                            errorMessage = 'Rate limit exceeded. Please wait a moment and try again.'
                        } else if (status !== undefined && status >= 500) {
                            errorMessage = 'AniList server error. Please try again later.'
                        } else if (!navigator.onLine) {
                            errorMessage = 'No internet connection. Please check your connection.'
                        }

                        set({
                            error: error instanceof Error ? error.message : 'Failed to load lists',
                            isLoadingLists: false
                        })
                        get().addNotification({ type: 'error', message: errorMessage })
                        throw error // Re-throw so calling code can handle it
                    }
                },

                // View actions
                setCurrentType: (currentType) => {
                    set({
                        currentType,
                        selectedEntries: new Set(),
                        currentStatus: 'ALL', // Reset status when switching types
                        filters: initialState.filters // Clear all filters when switching media types
                    })
                    // Apply filters immediately after state update
                    get().applyFilters()
                },
                setCurrentStatus: (currentStatus) => {
                    set({ currentStatus, selectedEntries: new Set() })
                    // Apply filters immediately after state update
                    get().applyFilters()
                },
                setViewMode: (viewMode) => {
                    set({ viewMode })
                },
                toggleStatusSection: (type, status) => {
                    set(state => {
                        const current = state.collapsedStatusSections[type] || []
                        const collapsed = current.includes(status)
                            ? current.filter(s => s !== status)
                            : [...current, status]
                        return {
                            collapsedStatusSections: {
                                ...state.collapsedStatusSections,
                                [type]: collapsed,
                            },
                        }
                    })
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
                selectEntries: (ids) => {
                    if (ids.length === 0) return
                    const selectedEntries = new Set(get().selectedEntries)
                    ids.forEach(id => selectedEntries.add(id))
                    set({ selectedEntries })
                },
                selectAllEntries: () => {
                    const filteredEntries = get().filteredEntries
                    const selectedEntries = new Set(filteredEntries.map(entry => entry.id))
                    set({ selectedEntries })
                },
                clearSelection: () => set({ selectedEntries: new Set() }),
                deselectEntries: (ids) => {
                    if (ids.length === 0) return
                    const selectedEntries = new Set(get().selectedEntries)
                    ids.forEach(id => selectedEntries.delete(id))
                    set({ selectedEntries })
                },
                setBulkEditMode: (bulkEditMode) => {
                    set({ bulkEditMode })
                    if (!bulkEditMode) {
                        set({ selectedEntries: new Set(), bulkEditOptions: null })
                    }
                },
                setBulkEditOptions: (bulkEditOptions) => set({ bulkEditOptions }),
                setEntrySync: (ids, syncState) => {
                    if (ids.length === 0) return
                    set(state => {
                        const entrySync = { ...state.entrySync }
                        ids.forEach(id => {
                            if (syncState === null) {
                                delete entrySync[id]
                            } else {
                                entrySync[id] = syncState
                            }
                        })
                        return { entrySync }
                    })
                },
                clearEntrySync: () => set({ entrySync: {} }),

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
                setShowHiddenFromStatusLists: (showHiddenFromStatusLists) => {
                    set({ showHiddenFromStatusLists })
                    get().applyFilters()
                },
                applyFilters: () => {
                    const state = get()
                    const { filters, currentType, currentStatus, showHiddenFromStatusLists } = state
                    let lists = state.getCurrentLists()
                    const sortedIndices = currentType === MediaType.ANIME ? state.animeSortedIndices : state.mangaSortedIndices

                    // Early return if no lists
                    if (lists.length === 0) {
                        set({ filteredEntries: [], selectedEntries: new Set() })
                        return
                    }

                    // Use Set for faster year/score range checking with binary search
                    let validIndices: Set<number> | null = null

                    // OPTIMIZATION: Use binary search for year filter (O(log n) instead of O(n))
                    if (filters.year && sortedIndices) {
                        const yearStart = filters.year.start
                        const yearEnd = filters.year.end

                        if (yearStart !== undefined || yearEnd !== undefined) {
                            const getYear = (idx: number) => {
                                const entry = lists[idx]
                                return entry.media?.startDate?.year || entry.media?.seasonYear || 0
                            }

                            const lowerBound = yearStart !== undefined ? binarySearchLowerBound(sortedIndices.byYear, yearStart, getYear) : 0
                            const upperBound = yearEnd !== undefined ? binarySearchUpperBound(sortedIndices.byYear, yearEnd, getYear) : sortedIndices.byYear.length

                            validIndices = new Set(sortedIndices.byYear.slice(lowerBound, upperBound))
                        }
                    }

                    // OPTIMIZATION: Use binary search for score filter (O(log n) instead of O(n))
                    if (filters.score && sortedIndices) {
                        const scoreMin = filters.score.min
                        const scoreMax = filters.score.max

                        if (scoreMin !== undefined || scoreMax !== undefined) {
                            const getScore = (idx: number) => lists[idx].score || 0

                            const lowerBound = scoreMin !== undefined ? binarySearchLowerBound(sortedIndices.byScore, scoreMin, getScore) : 0
                            const upperBound = scoreMax !== undefined ? binarySearchUpperBound(sortedIndices.byScore, scoreMax, getScore) : sortedIndices.byScore.length

                            const scoreIndices = new Set(sortedIndices.byScore.slice(lowerBound, upperBound))

                            // Intersect with year filter if it exists
                            if (validIndices) {
                                const validArray = Array.from(validIndices).filter(idx => scoreIndices.has(idx))
                                validIndices = new Set(validArray)
                            } else {
                                validIndices = scoreIndices
                            }
                        }
                    }

                    // Convert validIndices to actual entries if binary search was used
                    if (validIndices !== null) {
                        lists = Array.from(validIndices).map(idx => lists[idx])
                    }

                    // OPTIMIZATION: Single-pass filtering for all remaining filters
                    lists = lists.filter(entry => {
                        // Status filter
                        if (currentStatus !== 'ALL' && entry.status !== currentStatus) {
                            return false
                        }

                        // Hidden filter
                        if (!showHiddenFromStatusLists && entry.hiddenFromStatusLists) {
                            return false
                        }

                        // Additional status filters from FilterPanel (only if currentStatus is 'ALL')
                        if (currentStatus === 'ALL' && filters.status && filters.status.length > 0) {
                            const hasMatchingStatus = entry.status && filters.status.includes(entry.status)
                            const hasMatchingCustomList = entry.customLists && typeof entry.customLists === 'object' &&
                                Object.keys(entry.customLists).filter(key => entry.customLists && entry.customLists[key])
                                    .some(list => filters.status!.includes(list as MediaListStatus))

                            if (!hasMatchingStatus && !hasMatchingCustomList) {
                                return false
                            }
                        }

                        // Format filter
                        if (filters.format && filters.format.length > 0) {
                            if (!entry.media?.format || !filters.format.includes(entry.media.format)) {
                                return false
                            }
                        }

                        // Genre filter
                        if (filters.genre && filters.genre.length > 0) {
                            if (!entry.media?.genres?.some(genre => filters.genre!.includes(genre))) {
                                return false
                            }
                        }

                        // Country filter
                        if (filters.country && filters.country.length > 0) {
                            const country = entry.media?.countryOfOrigin
                            if (!country || !filters.country.includes(country)) {
                                return false
                            }
                        }

                        // Search filter
                        if (filters.search) {
                            const searchLower = filters.search.toLowerCase()
                            const title = entry.media?.title
                            const matchesSearch =
                                title?.romaji?.toLowerCase().includes(searchLower) ||
                                title?.english?.toLowerCase().includes(searchLower) ||
                                title?.native?.toLowerCase().includes(searchLower) ||
                                title?.userPreferred?.toLowerCase().includes(searchLower)

                            if (!matchesSearch) {
                                return false
                            }
                        }

                        // Year filter (fallback when binary search wasn't used)
                        if (validIndices === null && filters.year) {
                            const year = entry.media?.startDate?.year || entry.media?.seasonYear
                            if (year) {
                                if (filters.year.start !== undefined && year < filters.year.start) {
                                    return false
                                }
                                if (filters.year.end !== undefined && year > filters.year.end) {
                                    return false
                                }
                            }
                        }

                        // Score filter (fallback when binary search wasn't used)
                        if (validIndices === null && filters.score) {
                            const score = entry.score || 0
                            if (filters.score.min !== undefined && score < filters.score.min) {
                                return false
                            }
                            if (filters.score.max !== undefined && score > filters.score.max) {
                                return false
                            }
                        }

                        return true
                    })

                    // OPTIMIZATION: Extract common sorting logic to avoid duplication
                    const sortBy = filters.sortBy || 'title'
                    const sortOrder = filters.sortOrder || 'asc'

                    const getSortValue = (entry: MediaList) => {
                        switch (sortBy) {
                            case 'title':
                                return entry.media?.title?.userPreferred || entry.media?.title?.romaji || ''
                            case 'score':
                                return entry.score || 0
                            case 'progress':
                                return entry.progress || 0
                            case 'startDate':
                                return entry.startedAt?.year || 0
                            case 'updatedAt':
                                return entry.updatedAt || 0
                            default:
                                return ''
                        }
                    }

                    lists.sort((a, b) => {
                        // For 'ALL' status, first sort by status order
                        if (currentStatus === 'ALL') {
                            const statusOrder = {
                                [MediaListStatus.CURRENT]: 0,
                                [MediaListStatus.PLANNING]: 1,
                                [MediaListStatus.COMPLETED]: 2,
                                [MediaListStatus.DROPPED]: 3,
                                [MediaListStatus.PAUSED]: 4,
                                [MediaListStatus.REPEATING]: 5,
                            }

                            const aStatusOrder = statusOrder[a.status as MediaListStatus] ?? 999
                            const bStatusOrder = statusOrder[b.status as MediaListStatus] ?? 999

                            if (aStatusOrder !== bStatusOrder) {
                                return aStatusOrder - bStatusOrder
                            }
                        }

                        // Then sort by selected criteria
                        const aValue = getSortValue(a)
                        const bValue = getSortValue(b)

                        if (typeof aValue === 'string') {
                            const comparison = aValue.localeCompare(bValue as string)
                            return sortOrder === 'desc' ? -comparison : comparison
                        } else {
                            const comparison = (aValue as number) - (bValue as number)
                            // If sorting by score and scores are equal, sort alphabetically by title
                            if (sortBy === 'score' && comparison === 0) {
                                const aTitle = a.media?.title?.userPreferred || a.media?.title?.romaji || ''
                                const bTitle = b.media?.title?.userPreferred || b.media?.title?.romaji || ''
                                return aTitle.localeCompare(bTitle)
                            }
                            return sortOrder === 'desc' ? -comparison : comparison
                        }
                    })

                    // Remove duplicates (Map-based deduplication is faster than iterating)
                    const uniqueMap = new Map<number, MediaList>()
                    lists.forEach(entry => uniqueMap.set(entry.id, entry))
                    lists = Array.from(uniqueMap.values())

                    // A bulk edit acts on the selection, so never let it include
                    // entries a filter has hidden from view
                    const { selectedEntries } = get()
                    const visibleSelected = new Set(lists.filter(e => selectedEntries.has(e.id)).map(e => e.id))
                    set(visibleSelected.size === selectedEntries.size
                        ? { filteredEntries: lists }
                        : { filteredEntries: lists, selectedEntries: visibleSelected })
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
                    // Auto-dismiss lives in NotificationList so hover can pause it
                    set(state => ({
                        notifications: [...state.notifications, newNotification]
                    }))
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
                version: 1,
                // v0 stored a single user+accessToken; fold it into the accounts
                // registry so existing users stay signed in after upgrading
                migrate: (persisted, version) => {
                    const state = persisted as Partial<AppState>
                    if (version === 0 && state.user && state.accessToken) {
                        state.accounts = {
                            [state.user.id]: { user: state.user, accessToken: state.accessToken, addedAt: Date.now() }
                        }
                        state.activeAccountId = state.user.id
                    }
                    return state as AppState & AppActions
                },
                // user/accessToken are derived from the registry, not stored twice
                merge: (persisted, current) => {
                    const state = persisted as Partial<AppState>
                    const active = state.activeAccountId != null ? state.accounts?.[state.activeAccountId] : undefined
                    return {
                        ...current,
                        ...state,
                        user: active?.user ?? null,
                        accessToken: active?.accessToken ?? null,
                        // Older versions persisted this without the lists it described
                        lastDataLoad: null,
                        activeAccountId: active ? state.activeAccountId ?? null : null,
                    }
                },
                partialize: (state) => ({
                    // Lists aren't persisted (localStorage quota), so neither is lastDataLoad
                    accounts: state.accounts,
                    activeAccountId: state.activeAccountId,
                    darkMode: state.darkMode,
                    currentType: state.currentType,
                    filters: state.filters,
                    collapsedStatusSections: state.collapsedStatusSections,
                }),
            }
        ),
        {
            name: 'anilist-bulk-edit-store',
        }
    )
) 