import { useState, useEffect } from 'react'
import { useStore } from '@/store'
import { AniListClient } from '@/lib/anilist'
import { MediaType, MediaListStatus } from '@/types/anilist'
import { getStatusColor, getStatusLabel, getScoreDisplay } from '@/lib/anilist'
import {
    Grid3X3,
    List,
    Star,
    Calendar,
    Play,
    Book,
    ExternalLink,
    Edit3,
    Trash2,
    Check,
    X,
    ArrowUpDown,
    ArrowUp,
    ArrowDown
} from 'lucide-react'

interface MediaListViewProps {
    client: AniListClient | null
}

export default function MediaListView({ client }: MediaListViewProps) {
    const {
        user,
        currentType,
        currentStatus,
        filteredEntries,
        selectedEntries,
        bulkEditMode,
        animeLists,
        mangaLists,
        filters,
        setCurrentType,
        setCurrentStatus,
        setFilters,
        toggleEntrySelection,
        updateMediaListEntry,
        addNotification,
        setError,
        getCurrentLists,
        applyFilters
    } = useStore()

    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
    const [editingEntry, setEditingEntry] = useState<number | null>(null)
    const [editValues, setEditValues] = useState<{
        status?: MediaListStatus
        score?: number
        progress?: number
    }>({})

    // Ensure filters are applied when dependencies change
    useEffect(() => {
        if (animeLists.length > 0 || mangaLists.length > 0) {
            applyFilters()
        }
    }, [currentType, currentStatus, animeLists.length, mangaLists.length, filters.sortBy, filters.sortOrder, applyFilters])

    // Simple debug to check if we have entries and scores
    useEffect(() => {
        if (filteredEntries.length > 0) {
            console.log(`Found ${filteredEntries.length} entries. User score format: ${user?.mediaListOptions?.scoreFormat}`);
        }
    }, [filteredEntries.length, user?.mediaListOptions?.scoreFormat])

    // Calculate status counts from the base lists (before status filtering)
    const baseLists = currentType === MediaType.ANIME ? animeLists : mangaLists

    console.log('MediaListView render:', {
        currentType,
        currentStatus,
        baseListsLength: baseLists.length,
        filteredEntriesLength: filteredEntries.length,
        filteredEntriesPreview: filteredEntries.slice(0, 3).map(e => ({
            id: e.id,
            title: e.media?.title?.userPreferred,
            status: e.status
        }))
    })

    const statusCounts = {
        ALL: baseLists.length,
        [MediaListStatus.CURRENT]: baseLists.filter(e => e.status === MediaListStatus.CURRENT).length,
        [MediaListStatus.PLANNING]: baseLists.filter(e => e.status === MediaListStatus.PLANNING).length,
        [MediaListStatus.COMPLETED]: baseLists.filter(e => e.status === MediaListStatus.COMPLETED).length,
        [MediaListStatus.DROPPED]: baseLists.filter(e => e.status === MediaListStatus.DROPPED).length,
        [MediaListStatus.PAUSED]: baseLists.filter(e => e.status === MediaListStatus.PAUSED).length,
        [MediaListStatus.REPEATING]: baseLists.filter(e => e.status === MediaListStatus.REPEATING).length,
    }

    const handleQuickEdit = async (entryId: number, field: string, value: any) => {
        if (!client) return

        try {
            const updates = { [field]: value }
            const result = await client.updateMediaListEntry(entryId, updates)
            updateMediaListEntry(result)
            addNotification({
                type: 'success',
                message: `Updated ${field} successfully`
            })
        } catch (error) {
            console.error('Failed to update entry:', error)
            addNotification({
                type: 'error',
                message: `Failed to update ${field}`
            })
        }
    }

    const handleSaveEdit = async (entryId: number) => {
        if (!client) return

        try {
            const result = await client.updateMediaListEntry(entryId, editValues)
            updateMediaListEntry(result)
            setEditingEntry(null)
            setEditValues({})
            addNotification({
                type: 'success',
                message: 'Entry updated successfully'
            })
        } catch (error) {
            console.error('Failed to update entry:', error)
            addNotification({
                type: 'error',
                message: 'Failed to update entry'
            })
        }
    }

    const formatProgress = (entry: any) => {
        const current = entry.progress || 0
        const max = entry.media?.episodes || entry.media?.chapters
        return max ? `${current}/${max}` : current.toString()
    }

    const handleTypeChange = (type: MediaType) => {
        console.log('Button clicked - changing type to:', type)
        setCurrentType(type)
    }

    const handleStatusChange = (status: MediaListStatus | 'ALL') => {
        console.log('Button clicked - changing status to:', status)
        setCurrentStatus(status)
    }

    if (!user) {
        return (
            <div className="text-center py-8">
                <p className="text-gray-500 dark:text-gray-400">Please sign in to view your lists</p>
            </div>
        )
    }

    return (
        <div className="space-y-6" key={`${currentType}-${currentStatus}-${filteredEntries.length}`}>
            {/* Type and View Controls */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                {/* Media Type Tabs */}
                <div className="flex bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
                    <button
                        onClick={() => handleTypeChange(MediaType.ANIME)}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${currentType === MediaType.ANIME
                            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                            }`}
                    >
                        Anime
                    </button>
                    <button
                        onClick={() => handleTypeChange(MediaType.MANGA)}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${currentType === MediaType.MANGA
                            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                            }`}
                    >
                        Manga
                    </button>
                </div>

                {/* Controls Container */}
                <div className="flex items-center gap-4">
                    {/* Sort Controls */}
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Sort by:</span>
                        <select
                            value={filters.sortBy || 'title'}
                            onChange={(e) => setFilters({ sortBy: e.target.value as 'title' | 'score' })}
                            className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="title">Title</option>
                            <option value="score">Score</option>
                        </select>

                        <button
                            onClick={() => {
                                const newOrder = filters.sortOrder === 'asc' ? 'desc' : 'asc'
                                setFilters({ sortOrder: newOrder })
                            }}
                            className="p-1 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                            title={
                                filters.sortBy === 'score'
                                    ? `Currently: ${filters.sortOrder === 'asc' ? 'Low to High' : 'High to Low'} (Click to ${filters.sortOrder === 'asc' ? 'reverse' : 'reset'})`
                                    : `Currently: ${filters.sortOrder === 'asc' ? 'A-Z' : 'Z-A'} (Click to ${filters.sortOrder === 'asc' ? 'reverse' : 'reset'})`
                            }
                        >
                            {filters.sortBy === 'score' ? (
                                // For scores: up arrow = high scores, down arrow = low scores
                                filters.sortOrder === 'asc' ? (
                                    <ArrowUp className="w-4 h-4" />
                                ) : (
                                    <ArrowDown className="w-4 h-4" />
                                )
                            ) : (
                                // For titles: down arrow when asc (A-Z), up arrow when desc (Z-A)
                                filters.sortOrder === 'asc' ? (
                                    <ArrowDown className="w-4 h-4" />
                                ) : (
                                    <ArrowUp className="w-4 h-4" />
                                )
                            )}
                        </button>
                    </div>

                    {/* View Mode Toggle */}
                    <div className="flex bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-2 rounded-md transition-colors ${viewMode === 'grid'
                                ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                }`}
                            title="Grid View"
                        >
                            <Grid3X3 className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-2 rounded-md transition-colors ${viewMode === 'list'
                                ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                }`}
                            title="List View"
                        >
                            <List className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Status Filter Tabs */}
            <div className="flex flex-wrap gap-2">
                {Object.entries(statusCounts).map(([status, count]) => (
                    <button
                        key={status}
                        onClick={() => handleStatusChange(status as MediaListStatus | 'ALL')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${currentStatus === status
                            ? 'bg-blue-500 text-white'
                            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600'
                            }`}
                    >
                        {status === 'ALL' ? 'All' : getStatusLabel(status as MediaListStatus)} ({count})
                    </button>
                ))}
            </div>

            {/* Entries Grid/List */}
            {filteredEntries.length === 0 ? (
                <div className="text-center py-12">
                    <div className="text-gray-400 dark:text-gray-500 mb-2">
                        {currentType === MediaType.ANIME ? <Play className="w-12 h-12 mx-auto" /> : <Book className="w-12 h-12 mx-auto" />}
                    </div>
                    <p className="text-gray-500 dark:text-gray-400">
                        No {currentType.toLowerCase()} entries found
                    </p>
                </div>
            ) : (
                <div className={viewMode === 'grid'
                    ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4'
                    : 'space-y-2'
                }>
                    {filteredEntries.map((entry) => (
                        <div
                            key={entry.id}
                            className={`card media-card ${viewMode === 'list' ? 'p-4' : 'overflow-hidden'} ${selectedEntries.has(entry.id) ? 'ring-2 ring-blue-500' : ''
                                }`}
                        >
                            {bulkEditMode && (
                                <div className="absolute top-2 left-2 z-10">
                                    <input
                                        type="checkbox"
                                        checked={selectedEntries.has(entry.id)}
                                        onChange={() => toggleEntrySelection(entry.id)}
                                        className="checkbox"
                                    />
                                </div>
                            )}

                            {viewMode === 'grid' ? (
                                // Grid View
                                <div>
                                    {/* Cover Image */}
                                    <div className="aspect-[3/4] relative bg-gray-200 dark:bg-gray-700">
                                        {entry.media?.coverImage?.large && (
                                            <img
                                                src={entry.media.coverImage.large}
                                                alt={entry.media.title?.userPreferred || 'Cover'}
                                                className="w-full h-full object-cover"
                                            />
                                        )}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

                                        {/* Status Badge */}
                                        {entry.status && (
                                            <div className={`absolute top-2 right-2 px-2 py-1 rounded text-xs font-medium ${getStatusColor(entry.status)} text-white`}>
                                                {getStatusLabel(entry.status)}
                                            </div>
                                        )}

                                        {/* Score */}
                                        {(entry.score || entry.score === 0) && (
                                            <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/50 rounded px-2 py-1">
                                                <Star className="w-3 h-3 text-yellow-400 fill-current" />
                                                <span className="text-white text-xs">
                                                    {user?.mediaListOptions?.scoreFormat
                                                        ? getScoreDisplay(entry.score, user.mediaListOptions.scoreFormat)
                                                        : entry.score}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Content */}
                                    <div className="p-3">
                                        <h3 className="font-medium text-sm text-gray-900 dark:text-white line-clamp-2 mb-1">
                                            {entry.media?.title?.userPreferred || entry.media?.title?.romaji}
                                        </h3>

                                        <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                                            <div className="flex items-center gap-1">
                                                {currentType === MediaType.ANIME ? <Play className="w-3 h-3" /> : <Book className="w-3 h-3" />}
                                                <span>{formatProgress(entry)}</span>
                                            </div>

                                            {entry.media?.format && (
                                                <div>{entry.media.format}</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                // List View
                                <div className="flex items-center gap-4">
                                    {/* Cover Thumbnail */}
                                    <div className="w-12 h-16 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden flex-shrink-0">
                                        {entry.media?.coverImage?.medium && (
                                            <img
                                                src={entry.media.coverImage.medium}
                                                alt={entry.media.title?.userPreferred || 'Cover'}
                                                className="w-full h-full object-cover"
                                            />
                                        )}
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-medium text-gray-900 dark:text-white truncate">
                                            {entry.media?.title?.userPreferred || entry.media?.title?.romaji}
                                        </h3>

                                        <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mt-1">
                                            <span>{formatProgress(entry)}</span>
                                            {entry.status && (
                                                <span className={`px-2 py-1 rounded text-xs ${getStatusColor(entry.status)} text-white`}>
                                                    {getStatusLabel(entry.status)}
                                                </span>
                                            )}
                                            {(entry.score || entry.score === 0) && (
                                                <span className="flex items-center gap-1">
                                                    <Star className="w-3 h-3 text-yellow-400 fill-current" />
                                                    {user?.mediaListOptions?.scoreFormat
                                                        ? getScoreDisplay(entry.score, user.mediaListOptions.scoreFormat)
                                                        : entry.score}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2">
                                        {editingEntry === entry.id ? (
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleSaveEdit(entry.id)}
                                                    className="p-1 text-green-600 hover:bg-green-50 rounded"
                                                    title="Save"
                                                >
                                                    <Check className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setEditingEntry(null)
                                                        setEditValues({})
                                                    }}
                                                    className="p-1 text-gray-600 hover:bg-gray-50 rounded"
                                                    title="Cancel"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setEditingEntry(entry.id)}
                                                className="p-1 text-gray-600 hover:bg-gray-50 rounded"
                                                title="Edit"
                                            >
                                                <Edit3 className="w-4 h-4" />
                                            </button>
                                        )}

                                        <a
                                            href={entry.media?.siteUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-1 text-gray-600 hover:bg-gray-50 rounded"
                                            title="View on AniList"
                                        >
                                            <ExternalLink className="w-4 h-4" />
                                        </a>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
} 