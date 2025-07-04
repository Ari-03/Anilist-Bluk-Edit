import { useState } from 'react'
import { useStore } from '@/store'
import { AniListClient } from '@/lib/anilist'
import { MediaListStatus } from '@/types/anilist'
import { getStatusLabel } from '@/lib/anilist'
import {
    Edit3,
    CheckSquare,
    Square,
    Play,
    Save,
    X,
    Loader2,
    AlertCircle
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
        notes: ''
    })
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [processProgress, setProcessProgress] = useState({ current: 0, total: 0 })

    const selectedCount = selectedEntries.size
    const totalCount = filteredEntries.length
    const allSelected = selectedCount === totalCount && totalCount > 0

    const handleBulkOperation = async () => {
        if (!client || selectedCount === 0) return

        const updates: any = {}

        // Build updates object
        if (bulkOptions.status) updates.status = bulkOptions.status
        if (bulkOptions.score) updates.score = parseFloat(bulkOptions.score)
        if (bulkOptions.progress) updates.progress = parseInt(bulkOptions.progress)
        if (bulkOptions.private !== '') updates.private = bulkOptions.private === 'true'
        if (bulkOptions.notes.trim()) updates.notes = bulkOptions.notes

        if (Object.keys(updates).length === 0) {
            addNotification({
                type: 'warning',
                message: 'Please select at least one field to update'
            })
            return
        }

        setIsProcessing(true)
        setProcessProgress({ current: 0, total: selectedCount })

        try {
            const selectedMediaLists = getSelectedEntries()
            const updatePromises = selectedMediaLists.map(async (entry, index) => {
                try {
                    // Validate progress if being updated
                    if (updates.progress !== undefined) {
                        const maxProgress = entry.media?.episodes || entry.media?.chapters
                        if (maxProgress && updates.progress > maxProgress) {
                            updates.progress = maxProgress
                        }
                    }

                    const result = await client.updateMediaListEntry(entry.mediaId, updates)
                    updateMediaListEntry(result)
                    setProcessProgress(prev => ({ ...prev, current: prev.current + 1 }))
                    return result
                } catch (error) {
                    console.error(`Failed to update entry ${entry.id}:`, error)
                    setProcessProgress(prev => ({ ...prev, current: prev.current + 1 }))
                    throw error
                }
            })

            // Process updates with batching
            const batchSize = 5
            const results = []

            for (let i = 0; i < updatePromises.length; i += batchSize) {
                const batch = updatePromises.slice(i, i + batchSize)
                const batchResults = await Promise.allSettled(batch)
                results.push(...batchResults)

                // Add delay between batches to respect rate limits
                if (i + batchSize < updatePromises.length) {
                    await new Promise(resolve => setTimeout(resolve, 1000))
                }
            }

            const successful = results.filter(r => r.status === 'fulfilled').length
            const failed = results.filter(r => r.status === 'rejected').length

            addNotification({
                type: successful > 0 ? 'success' : 'error',
                message: `Bulk update completed: ${successful} successful, ${failed} failed`
            })

            // Reset form and selection
            setBulkOptions({
                status: '',
                score: '',
                progress: '',
                private: '',
                notes: ''
            })
            clearSelection()
            setBulkEditMode(false)

        } catch (error) {
            console.error('Bulk update failed:', error)
            addNotification({
                type: 'error',
                message: 'Bulk update failed. Please try again.'
            })
        } finally {
            setIsProcessing(false)
            setProcessProgress({ current: 0, total: 0 })
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
                                            {getStatusLabel(status)}
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
                                    min="0"
                                    max="100"
                                    step="1"
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

                        {/* Advanced Options Toggle */}
                        <button
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                        >
                            {showAdvanced ? 'Hide' : 'Show'} Advanced Options
                        </button>

                        {showAdvanced && (
                            <div className="border-t border-gray-200 dark:border-gray-600 pt-4 space-y-4">
                                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                                    <div className="flex items-center gap-2">
                                        <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                                        <p className="text-sm text-yellow-800 dark:text-yellow-200">
                                            Advanced options will be added in future versions
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Progress Bar */}
                    {isProcessing && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-600 dark:text-gray-400">
                                    Processing... ({processProgress.current}/{processProgress.total})
                                </span>
                                <span className="text-gray-600 dark:text-gray-400">
                                    {processProgress.total > 0 ? Math.round((processProgress.current / processProgress.total) * 100) : 0}%
                                </span>
                            </div>
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                <div
                                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                                    style={{
                                        width: processProgress.total > 0
                                            ? `${(processProgress.current / processProgress.total) * 100}%`
                                            : '0%'
                                    }}
                                />
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
                                    setBulkEditMode(false)
                                    clearSelection()
                                }}
                                className="btn-secondary"
                                disabled={isProcessing}
                            >
                                Cancel
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