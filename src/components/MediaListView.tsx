import { useState, useEffect } from 'react'
import { useStore } from '@/store'
import { AniListClient } from '@/lib/anilist'
import { MediaType, MediaListStatus } from '@/types/anilist'
import { getStatusColor, getStatusLabel, getScoreDisplay } from '@/lib/anilist'
import {
    Star,
    Play,
    Book,
    ExternalLink,
    Edit3,
    Check,
    X
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
        viewMode,
        toggleEntrySelection,
        updateMediaListEntry,
        addNotification,
        setError,
        getCurrentLists,
        applyFilters
    } = useStore()

    const [editingEntry, setEditingEntry] = useState<number | null>(null)
    const [editValues, setEditValues] = useState<{
        status?: MediaListStatus
        score?: number
        progress?: number
        notes?: string
    }>({})

    // Get score range based on user's score format
    const getScoreRange = () => {
        const scoreFormat = user?.mediaListOptions?.scoreFormat
        switch (scoreFormat) {
            case 'POINT_100':
                return { min: 0, max: 100, step: 1 }
            case 'POINT_10_DECIMAL':
                return { min: 0, max: 10, step: 0.1 }
            case 'POINT_10':
                return { min: 0, max: 10, step: 1 }
            case 'POINT_5':
                return { min: 0, max: 5, step: 1 }
            case 'POINT_3':
                return { min: 0, max: 3, step: 1 }
            default:
                return { min: 0, max: 10, step: 1 } // Default to 10-point scale
        }
    }

    const scoreRange = getScoreRange()

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

    console.log('MediaListView render:', {
        currentType,
        currentStatus,
        filteredEntriesLength: filteredEntries.length,
        filteredEntriesPreview: filteredEntries.slice(0, 3).map(e => ({
            id: e.id,
            title: e.media?.title?.userPreferred,
            status: e.status
        }))
    })

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

    const handleStartEdit = (entry: any) => {
        setEditingEntry(entry.id)
        setEditValues({
            status: entry.status,
            score: entry.score || 0,
            progress: entry.progress || 0,
            notes: entry.notes || ''
        })
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

    const formatScore = (entry: any) => {
        // In AniList, a score of 0 typically means "not scored"
        // Only show actual scores (greater than 0)
        const scoreExists = entry.score !== null && entry.score !== undefined && entry.score > 0;

        if (scoreExists) {
            // Just show the score as-is since AniList API returns it in the user's preferred format
            return entry.score.toString()
        }
        return '-'
    }

    const hasScore = (entry: any) => {
        return entry.score !== null && entry.score !== undefined && entry.score > 0
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
                            className={`card media-card ${viewMode === 'list' ? 'p-4' : 'overflow-hidden'} ${selectedEntries.has(entry.id) ? 'ring-4 ring-blue-500 bg-blue-100 dark:bg-blue-800/40 shadow-lg transform scale-[1.02] border-blue-500' : ''
                                } ${bulkEditMode ? 'group cursor-pointer hover:shadow-md hover:ring-2 hover:ring-blue-300 hover:transform hover:scale-[1.01] transition-all duration-200' : ''}`}
                            onClick={bulkEditMode ? (e) => {
                                // Prevent selection when clicking on interactive elements
                                const target = e.target as HTMLElement;
                                const isInteractiveElement = target.closest('button, a, input, select, textarea');
                                if (!isInteractiveElement) {
                                    toggleEntrySelection(entry.id);
                                }
                            } : undefined}
                        >
                            {bulkEditMode && (
                                <div className={`absolute top-2 left-2 z-10 transition-opacity duration-200 ${selectedEntries.has(entry.id)
                                    ? 'opacity-100'
                                    : 'opacity-0 group-hover:opacity-100'
                                    }`}>
                                    <input
                                        type="checkbox"
                                        checked={selectedEntries.has(entry.id)}
                                        onChange={(e) => {
                                            e.stopPropagation();
                                            toggleEntrySelection(entry.id);
                                        }}
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
                                                {getStatusLabel(entry.status, currentType)}
                                            </div>
                                        )}

                                        {/* Score */}
                                        <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/50 rounded px-2 py-1">
                                            <Star className={`w-3 h-3 fill-current ${hasScore(entry) ? 'text-yellow-400' : 'text-gray-400'}`} />
                                            <span className={`text-xs ${hasScore(entry) ? 'text-white' : 'text-gray-300'}`}>
                                                {formatScore(entry)}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Content */}
                                    <div className="p-3">
                                        <h3 className="font-medium text-sm text-gray-900 dark:text-white line-clamp-2 mb-1">
                                            {entry.media?.title?.userPreferred || entry.media?.title?.romaji}
                                        </h3>

                                        {editingEntry === entry.id ? (
                                            // Edit Form for Grid View
                                            <div className="mt-2 space-y-2">
                                                {/* Status */}
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                        Status
                                                    </label>
                                                    <select
                                                        value={editValues.status || ''}
                                                        onChange={(e) => setEditValues(prev => ({ ...prev, status: e.target.value as MediaListStatus }))}
                                                        className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    >
                                                        {Object.values(MediaListStatus).map(status => (
                                                            <option key={status} value={status}>
                                                                {getStatusLabel(status, currentType)}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                {/* Score */}
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                        Score
                                                    </label>
                                                    <input
                                                        type="number"
                                                        value={editValues.score || ''}
                                                        onChange={(e) => setEditValues(prev => ({ ...prev, score: parseFloat(e.target.value) || 0 }))}
                                                        min={scoreRange.min}
                                                        max={scoreRange.max}
                                                        step={scoreRange.step}
                                                        className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>

                                                {/* Progress */}
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                        Progress
                                                    </label>
                                                    <input
                                                        type="number"
                                                        value={editValues.progress || ''}
                                                        onChange={(e) => setEditValues(prev => ({ ...prev, progress: parseInt(e.target.value) || 0 }))}
                                                        min="0"
                                                        max={entry.media?.episodes || entry.media?.chapters || 999}
                                                        className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>

                                                {/* Edit Actions */}
                                                <div className="flex justify-end gap-2 mt-2">
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
                                            </div>
                                        ) : (
                                            // Normal Display for Grid View
                                            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                                                <div className="flex items-center gap-1">
                                                    {currentType === MediaType.ANIME ? <Play className="w-3 h-3" /> : <Book className="w-3 h-3" />}
                                                    <span>{formatProgress(entry)}</span>
                                                </div>

                                                {entry.media?.format && (
                                                    <div>{entry.media.format}</div>
                                                )}

                                                {/* Edit Button for Grid View */}
                                                <div className="flex justify-end mt-2">
                                                    <button
                                                        onClick={() => handleStartEdit(entry)}
                                                        className="p-1 text-gray-600 hover:bg-gray-50 rounded"
                                                        title="Edit"
                                                    >
                                                        <Edit3 className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
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

                                        {editingEntry === entry.id ? (
                                            // Edit Form
                                            <div className="mt-2 space-y-3">
                                                <div className="grid grid-cols-2 gap-3">
                                                    {/* Status */}
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                            Status
                                                        </label>
                                                        <select
                                                            value={editValues.status || ''}
                                                            onChange={(e) => setEditValues(prev => ({ ...prev, status: e.target.value as MediaListStatus }))}
                                                            className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                        >
                                                            {Object.values(MediaListStatus).map(status => (
                                                                <option key={status} value={status}>
                                                                    {getStatusLabel(status, currentType)}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    {/* Score */}
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                            Score
                                                        </label>
                                                        <input
                                                            type="number"
                                                            value={editValues.score || ''}
                                                            onChange={(e) => setEditValues(prev => ({ ...prev, score: parseFloat(e.target.value) || 0 }))}
                                                            min={scoreRange.min}
                                                            max={scoreRange.max}
                                                            step={scoreRange.step}
                                                            className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                        />
                                                    </div>

                                                    {/* Progress */}
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                            Progress
                                                        </label>
                                                        <input
                                                            type="number"
                                                            value={editValues.progress || ''}
                                                            onChange={(e) => setEditValues(prev => ({ ...prev, progress: parseInt(e.target.value) || 0 }))}
                                                            min="0"
                                                            max={entry.media?.episodes || entry.media?.chapters || 999}
                                                            className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                        />
                                                    </div>

                                                    {/* Notes */}
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                            Notes
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={editValues.notes || ''}
                                                            onChange={(e) => setEditValues(prev => ({ ...prev, notes: e.target.value }))}
                                                            className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            // Normal Display
                                            <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mt-1">
                                                <span>{formatProgress(entry)}</span>
                                                {entry.status && (
                                                    <span className={`px-2 py-1 rounded text-xs ${getStatusColor(entry.status)} text-white`}>
                                                        {getStatusLabel(entry.status, currentType)}
                                                    </span>
                                                )}
                                                <span className="flex items-center gap-1">
                                                    <Star className={`w-3 h-3 fill-current ${hasScore(entry) ? 'text-yellow-400' : 'text-gray-400'}`} />
                                                    <span className={hasScore(entry) ? 'text-gray-500 dark:text-gray-400' : 'text-gray-400 dark:text-gray-500'}>
                                                        {formatScore(entry)}
                                                    </span>
                                                </span>
                                            </div>
                                        )}
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
                                                onClick={() => handleStartEdit(entry)}
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