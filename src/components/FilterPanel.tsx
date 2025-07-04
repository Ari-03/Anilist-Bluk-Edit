import { useState } from 'react'
import { useStore } from '@/store'
import { MediaFormat, MediaListStatus } from '@/types/anilist'
import {
    Search,
    Filter,
    X,
    Calendar,
    Star,
    Tag,
    ChevronDown,
    ChevronUp
} from 'lucide-react'

export default function FilterPanel() {
    const {
        filters,
        setFilters,
        clearFilters
    } = useStore()

    const [isExpanded, setIsExpanded] = useState(false)
    const [showAdvanced, setShowAdvanced] = useState(false)

    const currentYear = new Date().getFullYear()
    const years = Array.from({ length: 50 }, (_, i) => currentYear - i)

    const hasActiveFilters = !!(
        filters.search ||
        filters.format?.length ||
        filters.status?.length ||
        filters.genre?.length ||
        filters.year ||
        filters.score
    )

    const handleFormatToggle = (format: string) => {
        const currentFormats = filters.format || []
        const newFormats = currentFormats.includes(format)
            ? currentFormats.filter(f => f !== format)
            : [...currentFormats, format]

        setFilters({ format: newFormats })
    }

    const handleStatusToggle = (status: MediaListStatus) => {
        const currentStatuses = filters.status || []
        const newStatuses = currentStatuses.includes(status)
            ? currentStatuses.filter(s => s !== status)
            : [...currentStatuses, status]

        setFilters({ status: newStatuses })
    }

    const handleGenreToggle = (genre: string) => {
        const currentGenres = filters.genre || []
        const newGenres = currentGenres.includes(genre)
            ? currentGenres.filter(g => g !== genre)
            : [...currentGenres, genre]

        setFilters({ genre: newGenres })
    }

    const handleYearChange = (year: number | null) => {
        if (year) {
            setFilters({ year: { start: year, end: year } })
        } else {
            setFilters({ year: undefined })
        }
    }

    const handleScoreRangeChange = (type: 'min' | 'max', value: number) => {
        const currentScore = filters.score || { min: 0, max: 100 }
        const newScore = { ...currentScore, [type]: value }

        // Ensure min <= max
        if (type === 'min' && (newScore.max === undefined || value > newScore.max)) {
            newScore.max = value
        } else if (type === 'max' && (newScore.min === undefined || value < newScore.min)) {
            newScore.min = value
        }

        setFilters({ score: newScore })
    }

    // Common genres for anime/manga
    const commonGenres = [
        'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror',
        'Mystery', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural',
        'Thriller', 'Psychological', 'Historical', 'Military', 'School',
        'Shounen', 'Shoujo', 'Seinen', 'Josei', 'Mecha', 'Music'
    ]

    return (
        <div className="card p-4 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Filter className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    <h3 className="font-medium text-gray-900 dark:text-white">Filters</h3>
                    {hasActiveFilters && (
                        <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 text-xs rounded-full">
                            Active
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {hasActiveFilters && (
                        <button
                            onClick={clearFilters}
                            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                        >
                            Clear All
                        </button>
                    )}
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="p-1 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                    >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {/* Search Bar - Always Visible */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                    type="text"
                    value={filters.search || ''}
                    onChange={(e) => setFilters({ search: e.target.value })}
                    placeholder="Search by title..."
                    className="input pl-10 pr-10"
                />
                {filters.search && (
                    <button
                        onClick={() => setFilters({ search: '' })}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Expanded Filters */}
            {isExpanded && (
                <div className="space-y-4 border-t border-gray-200 dark:border-gray-600 pt-4">
                    {/* Format Filter */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Format
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {Object.values(MediaFormat).map(format => (
                                <button
                                    key={format}
                                    onClick={() => handleFormatToggle(format)}
                                    className={`px-3 py-1 rounded-full text-xs transition-colors ${filters.format?.includes(format)
                                        ? 'bg-blue-500 text-white'
                                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                                        }`}
                                >
                                    {format.replace('_', ' ')}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Status Filter */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Status
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {Object.values(MediaListStatus).map(status => (
                                <button
                                    key={status}
                                    onClick={() => handleStatusToggle(status)}
                                    className={`px-3 py-1 rounded-full text-xs transition-colors ${filters.status?.includes(status)
                                        ? 'bg-green-500 text-white'
                                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                                        }`}
                                >
                                    {status.replace('_', ' ')}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Year Filter */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            <Calendar className="w-4 h-4 inline mr-1" />
                            Year
                        </label>
                        <select
                            value={filters.year?.start || ''}
                            onChange={(e) => handleYearChange(e.target.value ? parseInt(e.target.value) : null)}
                            className="select"
                        >
                            <option value="">Any</option>
                            {years.map(year => (
                                <option key={year} value={year}>
                                    {year}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Score Range */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            <Star className="w-4 h-4 inline mr-1" />
                            Score Range
                        </label>
                        <div className="space-y-2">
                            <div className="flex items-center gap-4">
                                <div className="flex-1">
                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Min</label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={filters.score?.min || 0}
                                        onChange={(e) => handleScoreRangeChange('min', parseInt(e.target.value))}
                                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                                    />
                                    <div className="text-xs text-center text-gray-600 dark:text-gray-400">
                                        {filters.score?.min || 0}
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Max</label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={filters.score?.max || 100}
                                        onChange={(e) => handleScoreRangeChange('max', parseInt(e.target.value))}
                                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                                    />
                                    <div className="text-xs text-center text-gray-600 dark:text-gray-400">
                                        {filters.score?.max || 100}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Advanced Filters Toggle */}
                    <div>
                        <button
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                        >
                            {showAdvanced ? 'Hide' : 'Show'} Advanced Filters
                        </button>
                    </div>

                    {/* Advanced Filters */}
                    {showAdvanced && (
                        <div className="space-y-4 border-t border-gray-200 dark:border-gray-600 pt-4">
                            {/* Genres */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    <Tag className="w-4 h-4 inline mr-1" />
                                    Genres
                                </label>
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                                    {commonGenres.map(genre => (
                                        <button
                                            key={genre}
                                            onClick={() => handleGenreToggle(genre)}
                                            className={`px-2 py-1 rounded text-xs transition-colors ${filters.genre?.includes(genre)
                                                ? 'bg-blue-500 text-white'
                                                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                                                }`}
                                        >
                                            {genre}
                                        </button>
                                    ))}
                                </div>
                                {filters.genre && filters.genre.length > 0 && (
                                    <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                        {filters.genre.length} genre{filters.genre.length !== 1 ? 's' : ''} selected
                                    </div>
                                )}
                            </div>

                            {/* Custom Genre Input */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Custom Genre
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Enter genre name..."
                                        className="input flex-1"
                                        onKeyPress={(e) => {
                                            if (e.key === 'Enter') {
                                                const value = (e.target as HTMLInputElement).value.trim()
                                                if (value && !filters.genre?.includes(value)) {
                                                    handleGenreToggle(value)
                                                        ; (e.target as HTMLInputElement).value = ''
                                                }
                                            }
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Active Filters Summary */}
                    {hasActiveFilters && (
                        <div className="border-t border-gray-200 dark:border-gray-600 pt-4">
                            <div className="flex flex-wrap gap-2">
                                {filters.search && (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 text-xs rounded">
                                        Search: "{filters.search}"
                                        <button
                                            onClick={() => setFilters({ search: '' })}
                                            className="text-blue-400 hover:text-blue-600"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </span>
                                )}

                                {filters.format?.map(format => (
                                    <span
                                        key={format}
                                        className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400 text-xs rounded"
                                    >
                                        {format.replace('_', ' ')}
                                        <button
                                            onClick={() => handleFormatToggle(format)}
                                            className="text-green-400 hover:text-green-600"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </span>
                                ))}

                                {filters.genre?.map(genre => (
                                    <span
                                        key={genre}
                                        className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-400 text-xs rounded"
                                    >
                                        {genre}
                                        <button
                                            onClick={() => handleGenreToggle(genre)}
                                            className="text-purple-400 hover:text-purple-600"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </span>
                                ))}

                                {filters.score && (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-600 dark:text-yellow-400 text-xs rounded">
                                        Score: {filters.score.min || 0}-{filters.score.max || 100}
                                        <button
                                            onClick={() => setFilters({ score: undefined })}
                                            className="text-yellow-400 hover:text-yellow-600"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
} 