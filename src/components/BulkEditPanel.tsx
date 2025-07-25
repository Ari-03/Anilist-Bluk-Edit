import { useState, useRef } from 'react'
import { useStore } from '@/store'
import { AniListClient } from '@/lib/anilist'
import { MediaListStatus, MediaType } from '@/types/anilist'
import { getStatusLabel } from '@/lib/anilist'
import { RateLimiter, RateLimiterStats } from '@/lib/rateLimiter'
import {
    Edit3,
    CheckSquare,
    Square,
    Play,
    Save,
    X,
    Loader2,
    AlertCircle,
    Settings,
    Activity,
    Clock,
    Zap
} from 'lucide-react'

interface BulkEditPanelProps {
    client: AniListClient | null
}

export default function BulkEditPanel({ client }: BulkEditPanelProps) {
    const {
        selectedEntries,
        bulkEditMode,
        filteredEntries,
        user,
        currentType,
        setBulkEditMode,
        selectAllEntries,
        clearSelection,
        getSelectedEntries,
        updateMediaListEntry,
        addNotification
    } = useStore()

    const [isProcessing, setIsProcessing] = useState(false)
    const [bulkOptions, setBulkOptions] = useState({
        status: '' as MediaListStatus | '',
        score: '',
        progress: '',
        private: '',
        hiddenFromStatusLists: '',
        notes: '',
        customLists: {} as Record<string, boolean>
    })
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [showRateLimitConfig, setShowRateLimitConfig] = useState(false)
    const [processProgress, setProcessProgress] = useState({ current: 0, total: 0, successful: 0, failed: 0 })
    const [rateLimiterStats, setRateLimiterStats] = useState<RateLimiterStats | null>(null)
    const [rateLimiterConfig, setRateLimiterConfig] = useState({
        maxRequestsPerSecond: 0.5, // Optimized for GraphQL batching - each request now handles 15+ updates
        maxConcurrentRequests: 1,  // Single batched request at a time
        maxRetries: 3,             // Fewer retries since batching reduces overall requests
        initialRetryDelay: 2000    // Longer initial delay for batched operations
    })

    const [isCancelling, setIsCancelling] = useState(false)

    const rateLimiterRef = useRef<RateLimiter | null>(null)

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
    const selectedCount = selectedEntries.size
    const totalCount = filteredEntries.length
    const allSelected = selectedCount === totalCount && totalCount > 0

    // Get available custom lists for the current type
    const getAvailableCustomLists = () => {
        if (!user?.mediaListOptions) return []

        const currentTypeKey = currentType === MediaType.ANIME ? 'animeList' : 'mangaList'
        const typeOptions = user.mediaListOptions[currentTypeKey]

        return typeOptions?.customLists || []
    }

    const availableCustomLists = getAvailableCustomLists()

    const handleBulkOperation = async () => {
        if (!client || selectedCount === 0) return

        const updates: any = {}

        // Build updates object
        if (bulkOptions.status) updates.status = bulkOptions.status
        if (bulkOptions.score) updates.score = parseFloat(bulkOptions.score)
        if (bulkOptions.progress) updates.progress = parseInt(bulkOptions.progress)
        if (bulkOptions.private !== '') updates.private = bulkOptions.private === 'true'
        if (bulkOptions.hiddenFromStatusLists !== '') updates.hiddenFromStatusLists = bulkOptions.hiddenFromStatusLists === 'true'
        if (bulkOptions.notes.trim()) updates.notes = bulkOptions.notes

        // Handle custom lists - convert to array format expected by API
        const selectedCustomLists = Object.entries(bulkOptions.customLists)
            .filter(([_, isSelected]) => isSelected)
            .map(([listName, _]) => listName)

        if (selectedCustomLists.length > 0) {
            updates.customLists = selectedCustomLists
        }

        if (Object.keys(updates).length === 0 && selectedCustomLists.length === 0) {
            addNotification({
                type: 'warning',
                message: 'Please select at least one field to update'
            })
            return
        }

        setIsProcessing(true)
        setIsCancelling(false) // Reset cancelling state
        const selectedMediaLists = getSelectedEntries()
        const totalEntries = selectedMediaLists.length
        setProcessProgress({ current: 0, total: totalEntries, successful: 0, failed: 0 })

        // Separate entries into existing and new
        const existingEntries = selectedMediaLists.filter(entry => entry.id)
        const newEntries = selectedMediaLists.filter(entry => !entry.id)

        // Initialize rate limiter with current config
        rateLimiterRef.current = new RateLimiter(rateLimiterConfig)

        let successfulCount = 0
        let failedCount = 0

        try {
            addNotification({
                type: 'info',
                message: `Starting bulk update of ${totalEntries} entries...`
            })

            // Process existing entries in bulk
            if (existingEntries.length > 0) {
                const entryIds = existingEntries.map(entry => entry.id)
                try {
                    const results = await rateLimiterRef.current.execute(async () => {
                        return await client.updateMediaListEntries(entryIds, updates)
                    })
                    successfulCount += results.length
                    failedCount += existingEntries.length - results.length

                    results.forEach(result => {
                        updateMediaListEntry(result)
                    })
                } catch (error: any) {
                    console.error('Bulk update for existing entries failed:', error)
                    failedCount += existingEntries.length
                    addNotification({
                        type: 'error',
                        message: `Failed to update ${existingEntries.length} existing entries. ${error.message || 'Please try again.'}`
                    })
                }
            }

            // Process new entries individually
            if (newEntries.length > 0) {
                for (const entry of newEntries) {
                    if (isCancelling) break
                    try {
                        const result = await rateLimiterRef.current.execute(async () => {
                            return await client.updateMediaListEntry(entry.mediaId, updates)
                        })
                        successfulCount++
                        updateMediaListEntry(result)
                    } catch (error: any) {
                        console.error(`Failed to add new entry ${entry.media.title.userPreferred}:`, error)
                        failedCount++
                    }
                    setProcessProgress({ 
                        current: successfulCount + failedCount, 
                        total: totalEntries, 
                        successful: successfulCount, 
                        failed: failedCount 
                    })
                }
            }

            setProcessProgress({ 
                current: totalEntries, 
                total: totalEntries, 
                successful: successfulCount, 
                failed: failedCount 
            })

            // Update stats display
            if (rateLimiterRef.current) {
                setRateLimiterStats(rateLimiterRef.current.getStats())
            }

            const finalStats = rateLimiterRef.current?.getStats()
            if (finalStats) {
                setRateLimiterStats(finalStats)
            }

            addNotification({
                type: successfulCount > 0 ? 'success' : 'error',
                message: `Bulk update completed: ${successfulCount} successful, ${failedCount} failed${finalStats ? `. Rate limit hits: ${finalStats.rateLimitHits}, Retries: ${finalStats.retriedRequests}` : ''}`
            })

            // Re-fetch the entire list to ensure data consistency
            if (user) {
                useStore.getState().fetchMediaLists(user.id, currentType, true)
            }

            // Reset form and selection
            setBulkOptions({
                status: '',
                score: '',
                progress: '',
                private: '',
                hiddenFromStatusLists: '',
                notes: '',
                customLists: {}
            })
            clearSelection()
            setBulkEditMode(false)

        } catch (error: any) {
            console.error('Bulk update failed:', error);
            console.error('Error details:', JSON.stringify(error, null, 2));
            addNotification({
                type: 'error',
                message: `Bulk update failed. ${error.message || 'Please try again.'}`
            })
        } finally {
            setIsProcessing(false)
            setIsCancelling(false)
        }
    }

    if (!bulkEditMode) {
        return (
            <div className="card p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Edit3 className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                        <div>
                            <h3 className="font-medium text-gray-900 dark:text-white">Bulk Edit</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Select multiple entries to edit them at once
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => setBulkEditMode(true)}
                        className="btn-primary"
                    >
                        Enable Bulk Edit
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="card p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <CheckSquare className="w-5 h-5 text-blue-600" />
                    <div>
                        <h3 className="font-medium text-gray-900 dark:text-white">
                            Bulk Edit Mode
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {selectedCount} of {totalCount} entries selected
                        </p>
                        <p className="text-xs text-blue-600 dark:text-blue-400">
                            💡 Click anywhere on a card to select it
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => {
                        setBulkEditMode(false)
                        clearSelection()
                    }}
                    className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                    title="Exit Bulk Edit"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Selection Controls */}
            <div className="flex items-center gap-4">
                <button
                    onClick={allSelected ? clearSelection : selectAllEntries}
                    className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                >
                    {allSelected ? <Square className="w-4 h-4" /> : <CheckSquare className="w-4 h-4" />}
                    {allSelected ? 'Deselect All' : 'Select All'}
                </button>

                {selectedCount > 0 && (
                    <button
                        onClick={clearSelection}
                        className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                    >
                        Clear Selection
                    </button>
                )}
            </div>

            {selectedCount > 0 && (
                <>
                    {/* Bulk Edit Form */}
                    <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 space-y-4">
                        <h4 className="font-medium text-gray-900 dark:text-white">
                            Bulk Edit Options
                        </h4>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {/* Status */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Status
                                </label>
                                <select
                                    value={bulkOptions.status}
                                    onChange={(e) => setBulkOptions(prev => ({ ...prev, status: e.target.value as MediaListStatus }))}
                                    className="select"
                                >
                                    <option value="">No change</option>
                                    {Object.values(MediaListStatus).map(status => (
                                        <option key={status} value={status}>
                                            {getStatusLabel(status, currentType)}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Score */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Score
                                </label>
                                <input
                                    type="number"
                                    value={bulkOptions.score}
                                    onChange={(e) => setBulkOptions(prev => ({ ...prev, score: e.target.value }))}
                                    placeholder="No change"
                                    min={scoreRange.min}
                                    max={scoreRange.max}
                                    step={scoreRange.step}
                                    className="input"
                                />
                            </div>

                            {/* Progress */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Progress
                                </label>
                                <input
                                    type="number"
                                    value={bulkOptions.progress}
                                    onChange={(e) => setBulkOptions(prev => ({ ...prev, progress: e.target.value }))}
                                    placeholder="No change"
                                    min="0"
                                    className="input"
                                />
                            </div>

                            {/* Privacy */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Privacy
                                </label>
                                <select
                                    value={bulkOptions.private}
                                    onChange={(e) => setBulkOptions(prev => ({ ...prev, private: e.target.value }))}
                                    className="select"
                                >
                                    <option value="">No change</option>
                                    <option value="false">Public</option>
                                    <option value="true">Private</option>
                                </select>
                            </div>

                            {/* Hide from Status List */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Hide from Status List
                                </label>
                                <select
                                    value={bulkOptions.hiddenFromStatusLists}
                                    onChange={(e) => setBulkOptions(prev => ({ ...prev, hiddenFromStatusLists: e.target.value }))}
                                    className="select"
                                >
                                    <option value="">No change</option>
                                    <option value="false">Show in Status List</option>
                                    <option value="true">Hide from Status List</option>
                                </select>
                            </div>

                            {/* Notes */}
                            <div className="sm:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Notes
                                </label>
                                <input
                                    type="text"
                                    value={bulkOptions.notes}
                                    onChange={(e) => setBulkOptions(prev => ({ ...prev, notes: e.target.value }))}
                                    placeholder="No change"
                                    className="input"
                                />
                            </div>
                        </div>

                        {/* Custom Lists */}
                        {availableCustomLists.length > 0 && (
                            <div className="border-t border-gray-200 dark:border-gray-600 pt-4">
                                <h5 className="font-medium text-gray-900 dark:text-white mb-3">
                                    Custom Lists
                                </h5>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                    {availableCustomLists.map(listName => (
                                        <label key={listName} className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={bulkOptions.customLists[listName] || false}
                                                onChange={(e) => setBulkOptions(prev => ({
                                                    ...prev,
                                                    customLists: {
                                                        ...prev.customLists,
                                                        [listName]: e.target.checked
                                                    }
                                                }))}
                                                className="checkbox"
                                            />
                                            <span className="text-sm text-gray-700 dark:text-gray-300">
                                                {listName}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                    <strong>Note:</strong> Selected entries will be added to the checked custom lists.
                                    To remove from custom lists, uncheck them (entries will be removed from those lists).
                                </p>
                            </div>
                        )}

                        {/* Advanced Options Toggle */}
                        <button
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                        >
                            {showAdvanced ? 'Hide' : 'Show'} Advanced Options
                        </button>

                        {showAdvanced && (
                            <div className="border-t border-gray-200 dark:border-gray-600 pt-4 space-y-4">
                                {/* Rate Limiter Configuration */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h5 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                            <Zap className="w-4 h-4" />
                                            Rate Limiting Configuration
                                        </h5>
                                        <button
                                            onClick={() => setShowRateLimitConfig(!showRateLimitConfig)}
                                            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                                        >
                                            {showRateLimitConfig ? 'Hide' : 'Show'} Config
                                        </button>
                                    </div>

                                    {showRateLimitConfig && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                    Max Requests/Second
                                                </label>
                                                <input
                                                    type="number"
                                                    value={rateLimiterConfig.maxRequestsPerSecond}
                                                    onChange={(e) => setRateLimiterConfig(prev => ({
                                                        ...prev,
                                                        maxRequestsPerSecond: Math.max(0.1, parseFloat(e.target.value) || 0.1)
                                                    }))}
                                                    min="0.1"
                                                    max="0.4"
                                                    step="0.1"
                                                    className="input text-sm"
                                                    disabled={isProcessing}
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                    Max Concurrent Requests
                                                </label>
                                                <input
                                                    type="number"
                                                    value={rateLimiterConfig.maxConcurrentRequests}
                                                    onChange={(e) => setRateLimiterConfig(prev => ({
                                                        ...prev,
                                                        maxConcurrentRequests: Math.max(1, parseInt(e.target.value) || 1)
                                                    }))}
                                                    min="1"
                                                    max="1"
                                                    className="input text-sm"
                                                    disabled={isProcessing}
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                    Max Retries
                                                </label>
                                                <input
                                                    type="number"
                                                    value={rateLimiterConfig.maxRetries}
                                                    onChange={(e) => setRateLimiterConfig(prev => ({
                                                        ...prev,
                                                        maxRetries: Math.max(0, parseInt(e.target.value) || 0)
                                                    }))}
                                                    min="0"
                                                    max="10"
                                                    className="input text-sm"
                                                    disabled={isProcessing}
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                    Initial Retry Delay (ms)
                                                </label>
                                                <input
                                                    type="number"
                                                    value={rateLimiterConfig.initialRetryDelay}
                                                    onChange={(e) => setRateLimiterConfig(prev => ({
                                                        ...prev,
                                                        initialRetryDelay: Math.max(100, parseInt(e.target.value) || 100)
                                                    }))}
                                                    min="100"
                                                    max="10000"
                                                    step="100"
                                                    className="input text-sm"
                                                    disabled={isProcessing}
                                                />
                                            </div>

                                            <div className="sm:col-span-2">
                                                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                                                    <div className="flex items-center gap-2">
                                                        <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                                        <p className="text-sm text-blue-800 dark:text-blue-200">
                                                            <strong>Note:</strong> AniList is currently limited to <strong>30 requests per minute</strong> (degraded state).
                                                            Default 0.4/sec = 24/min provides safety margin. Normal limit is 90/min.
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Rate Limiter Stats */}
                                    {rateLimiterStats && (
                                        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                                            <h6 className="font-medium text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                                                <Activity className="w-4 h-4" />
                                                Rate Limiter Statistics
                                            </h6>
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                                                <div>
                                                    <div className="text-gray-500 dark:text-gray-400">Total Requests</div>
                                                    <div className="font-medium">{rateLimiterStats.totalRequests}</div>
                                                </div>
                                                <div>
                                                    <div className="text-gray-500 dark:text-gray-400">Successful</div>
                                                    <div className="font-medium text-green-600">{rateLimiterStats.successfulRequests}</div>
                                                </div>
                                                <div>
                                                    <div className="text-gray-500 dark:text-gray-400">Failed</div>
                                                    <div className="font-medium text-red-600">{rateLimiterStats.failedRequests}</div>
                                                </div>
                                                <div>
                                                    <div className="text-gray-500 dark:text-gray-400">Rate Limit Hits</div>
                                                    <div className="font-medium text-orange-600">{rateLimiterStats.rateLimitHits}</div>
                                                </div>
                                                <div>
                                                    <div className="text-gray-500 dark:text-gray-400">Retries</div>
                                                    <div className="font-medium text-yellow-600">{rateLimiterStats.retriedRequests}</div>
                                                </div>
                                                <div>
                                                    <div className="text-gray-500 dark:text-gray-400">Avg Response Time</div>
                                                    <div className="font-medium">{Math.round(rateLimiterStats.averageResponseTime)}ms</div>
                                                </div>
                                                <div>
                                                    <div className="text-gray-500 dark:text-gray-400">Queue Size</div>
                                                    <div className="font-medium">{rateLimiterStats.currentQueueSize}</div>
                                                </div>
                                                <div>
                                                    <div className="text-gray-500 dark:text-gray-400">Success Rate</div>
                                                    <div className="font-medium">
                                                        {rateLimiterStats.totalRequests > 0
                                                            ? Math.round((rateLimiterStats.successfulRequests / rateLimiterStats.totalRequests) * 100)
                                                            : 0}%
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Progress Bar */}
                    {isProcessing && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
                                    <Clock className="w-4 h-4" />
                                    Processing... ({processProgress.current}/{processProgress.total})
                                    {rateLimiterStats && rateLimiterStats.currentQueueSize > 0 && (
                                        <span className="text-orange-600 dark:text-orange-400">
                                            • Queue: {rateLimiterStats.currentQueueSize}
                                        </span>
                                    )}
                                </span>
                                <span className="text-gray-600 dark:text-gray-400">
                                    {processProgress.total > 0 ? Math.min(100, Math.round((processProgress.current / processProgress.total) * 100)) : 0}%
                                </span>
                            </div>
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                <div
                                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                                    style={{
                                        width: processProgress.total > 0
                                            ? `${Math.min(100, (processProgress.current / processProgress.total) * 100)}%`
                                            : '0%'
                                    }}
                                />
                            </div>
                            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                                <span>Success: {processProgress.successful}</span>
                                <span>Failed: {processProgress.failed}</span>
                                {rateLimiterStats && (
                                    <>
                                        <span>Rate Limits: {rateLimiterStats.rateLimitHits}</span>
                                        <span>Retries: {rateLimiterStats.retriedRequests}</span>
                                        <span>Avg Time: {Math.round(rateLimiterStats.averageResponseTime)}ms</span>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-600">
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                            {selectedCount} {selectedCount === 1 ? 'entry' : 'entries'} will be updated
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => {
                                    if (isProcessing) {
                                        if (rateLimiterRef.current) {
                                            rateLimiterRef.current.stop()
                                        }
                                        setIsCancelling(true)
                                        addNotification({ type: 'info', message: 'Cancelling bulk edit... The current item will finish processing.' })
                                    } else {
                                        setBulkEditMode(false)
                                        clearSelection()
                                    }
                                }}
                                className="btn-secondary"
                                disabled={isCancelling}
                            >
                                {isProcessing ? (isCancelling ? 'Cancelling...' : 'Cancel') : 'Cancel'}
                            </button>
                            <button
                                onClick={handleBulkOperation}
                                disabled={isProcessing || selectedCount === 0}
                                className="btn-primary flex items-center gap-2"
                            >
                                {isProcessing ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Save className="w-4 h-4" />
                                )}
                                {isProcessing ? 'Processing...' : 'Apply Changes'}
                            </button>
                        </div>
                    </div>
                </>
            )}

            {selectedCount === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <CheckSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>Select entries to bulk edit</p>
                    <p className="text-sm">Use the checkboxes on each entry to select them</p>
                </div>
            )}
        </div>
    )
} 