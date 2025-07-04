import { useStore } from '@/store'
import { MediaType, MediaListStatus } from '@/types/anilist'

export default function DebugPanel() {
    const {
        user,
        currentType,
        currentStatus,
        animeLists,
        mangaLists,
        filteredEntries,
        selectedEntries,
        filters,
        setCurrentType,
        setCurrentStatus,
        applyFilters,
        getCurrentLists
    } = useStore()

    const baseLists = getCurrentLists()

    const handleTestAnime = () => {
        console.log('=== TEST: Switching to ANIME ===')
        setCurrentType(MediaType.ANIME)
    }

    const handleTestManga = () => {
        console.log('=== TEST: Switching to MANGA ===')
        setCurrentType(MediaType.MANGA)
    }

    const handleTestStatus = (status: MediaListStatus | 'ALL') => {
        console.log(`=== TEST: Switching to STATUS ${status} ===`)
        setCurrentStatus(status)
    }

    const handleForceFilter = () => {
        console.log('=== TEST: Force applying filters ===')
        applyFilters()
    }

    return (
        <div className="card p-4 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
            <h3 className="text-lg font-semibold text-yellow-800 dark:text-yellow-200 mb-4">Debug Panel</h3>

            {/* Current State */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                    <h4 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">Current State:</h4>
                    <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                        <li><strong>Type:</strong> {currentType}</li>
                        <li><strong>Status:</strong> {currentStatus}</li>
                        <li><strong>Anime Lists:</strong> {animeLists.length}</li>
                        <li><strong>Manga Lists:</strong> {mangaLists.length}</li>
                        <li><strong>Current Lists (getCurrentLists):</strong> {baseLists.length}</li>
                        <li><strong>Filtered Entries:</strong> {filteredEntries.length}</li>
                        <li><strong>Selected:</strong> {selectedEntries.size}</li>
                    </ul>
                </div>

                <div>
                    <h4 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">List Previews:</h4>
                    <div className="text-sm text-yellow-700 dark:text-yellow-300 space-y-2">
                        <div>
                            <strong>Base Lists (first 3):</strong>
                            <ul className="ml-2">
                                {baseLists.slice(0, 3).map(entry => (
                                    <li key={entry.id}>
                                        {entry.media?.title?.userPreferred} ({entry.status})
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div>
                            <strong>Filtered Entries (first 3):</strong>
                            <ul className="ml-2">
                                {filteredEntries.slice(0, 3).map(entry => (
                                    <li key={entry.id}>
                                        {entry.media?.title?.userPreferred} ({entry.status})
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            {/* Test Buttons */}
            <div className="space-y-2">
                <h4 className="font-medium text-yellow-800 dark:text-yellow-200">Test Actions:</h4>
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={handleTestAnime}
                        className={`px-3 py-1 rounded text-sm ${currentType === MediaType.ANIME
                                ? 'bg-yellow-600 text-white'
                                : 'bg-yellow-200 text-yellow-800 hover:bg-yellow-300'
                            }`}
                    >
                        Test Anime
                    </button>
                    <button
                        onClick={handleTestManga}
                        className={`px-3 py-1 rounded text-sm ${currentType === MediaType.MANGA
                                ? 'bg-yellow-600 text-white'
                                : 'bg-yellow-200 text-yellow-800 hover:bg-yellow-300'
                            }`}
                    >
                        Test Manga
                    </button>
                    <button
                        onClick={() => handleTestStatus('ALL')}
                        className={`px-3 py-1 rounded text-sm ${currentStatus === 'ALL'
                                ? 'bg-yellow-600 text-white'
                                : 'bg-yellow-200 text-yellow-800 hover:bg-yellow-300'
                            }`}
                    >
                        Test ALL
                    </button>
                    <button
                        onClick={() => handleTestStatus(MediaListStatus.CURRENT)}
                        className={`px-3 py-1 rounded text-sm ${currentStatus === MediaListStatus.CURRENT
                                ? 'bg-yellow-600 text-white'
                                : 'bg-yellow-200 text-yellow-800 hover:bg-yellow-300'
                            }`}
                    >
                        Test CURRENT
                    </button>
                    <button
                        onClick={handleForceFilter}
                        className="px-3 py-1 rounded text-sm bg-yellow-300 text-yellow-900 hover:bg-yellow-400"
                    >
                        Force Filter
                    </button>
                </div>
            </div>

            {/* Filters */}
            {Object.keys(filters).length > 0 && (
                <div className="mt-4">
                    <h4 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">Active Filters:</h4>
                    <pre className="text-xs text-yellow-700 dark:text-yellow-300 bg-yellow-100 dark:bg-yellow-900/30 p-2 rounded">
                        {JSON.stringify(filters, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    )
} 