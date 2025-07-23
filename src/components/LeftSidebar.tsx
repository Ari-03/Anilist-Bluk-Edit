import React, { useState } from 'react'
import { useStore } from '@/store'
import { MediaType, MediaListStatus, MediaFormat } from '@/types/anilist'
import {
    Search,
    X,
    Filter,
    Star,
    Calendar,
    Globe,
    Tag,
    Tv,
    BookOpen,
    Grid3X3,
    List,
    ArrowUpDown,
    ChevronRight
} from 'lucide-react'

const ANIME_FORMATS = [
    { value: MediaFormat.TV, label: 'TV Series' },
    { value: MediaFormat.MOVIE, label: 'Movie' },
    { value: MediaFormat.OVA, label: 'OVA' },
    { value: MediaFormat.ONA, label: 'ONA' },
    { value: MediaFormat.SPECIAL, label: 'Special' },
    { value: MediaFormat.TV_SHORT, label: 'TV Short' },
    { value: MediaFormat.MUSIC, label: 'Music' }
]

const MANGA_FORMATS = [
    { value: MediaFormat.MANGA, label: 'Manga' },
    { value: MediaFormat.NOVEL, label: 'Light Novel' },
    { value: MediaFormat.ONE_SHOT, label: 'One Shot' }
]

const STATUS_OPTIONS = [
    { value: 'ALL', label: 'All' },
    { value: MediaListStatus.CURRENT, label: 'Current' },
    { value: MediaListStatus.COMPLETED, label: 'Completed' },
    { value: MediaListStatus.PLANNING, label: 'Planning' },
    { value: MediaListStatus.DROPPED, label: 'Dropped' },
    { value: MediaListStatus.PAUSED, label: 'Paused' },
    { value: MediaListStatus.REPEATING, label: 'Repeating' }
]

const COUNTRIES = [
    { value: 'JP', label: 'Japan' },
    { value: 'KR', label: 'South Korea' },
    { value: 'CN', label: 'China' },
    { value: 'TW', label: 'Taiwan' },
    { value: 'US', label: 'United States' },
    { value: 'OTHER', label: 'Other' }
]

const COMMON_GENRES = [
    'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror',
    'Mystery', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural',
    'Thriller', 'Ecchi', 'Harem', 'Josei', 'Kids', 'Mecha', 'Military',
    'Music', 'Parody', 'Police', 'Psychological', 'School', 'Seinen',
    'Shoujo', 'Shounen', 'Space', 'Super Power', 'Vampire', 'Yaoi', 'Yuri'
]

export default function LeftSidebar() {
    const {
        currentType,
        setCurrentType,
        viewMode,
        setViewMode,
        filters,
        setFilters,
        clearFilters,
        user
    } = useStore()

    const [activePopout, setActivePopout] = useState<string | null>(null)

    const togglePopout = (section: string) => {
        setActivePopout(activePopout === section ? null : section)
    }

    const handleSearchChange = (value: string) => {
        setFilters({ ...filters, search: value })
    }

    const handleStatusFilter = (status: string) => {
        if (status === 'ALL') {
            setFilters({ ...filters, status: undefined })
        } else {
            const statusArray = filters.status || []
            const statusValue = status as MediaListStatus
            
            if (statusArray.includes(statusValue)) {
                setFilters({
                    ...filters,
                    status: statusArray.filter(s => s !== statusValue)
                })
            } else {
                setFilters({
                    ...filters,
                    status: [...statusArray, statusValue]
                })
            }
        }
    }

    const handleFormatFilter = (format: string) => {
        const formatArray = filters.format || []
        
        if (formatArray.includes(format)) {
            setFilters({
                ...filters,
                format: formatArray.filter(f => f !== format)
            })
        } else {
            setFilters({
                ...filters,
                format: [...formatArray, format]
            })
        }
    }

    const handleGenreFilter = (genre: string) => {
        const genreArray = filters.genre || []
        
        if (genreArray.includes(genre)) {
            setFilters({
                ...filters,
                genre: genreArray.filter(g => g !== genre)
            })
        } else {
            setFilters({
                ...filters,
                genre: [...genreArray, genre]
            })
        }
    }

    const handleCountryFilter = (country: string) => {
        const countryArray = filters.country || []
        
        if (countryArray.includes(country)) {
            setFilters({
                ...filters,
                country: countryArray.filter(c => c !== country)
            })
        } else {
            setFilters({
                ...filters,
                country: [...countryArray, country]
            })
        }
    }

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
                return { min: 0, max: 10, step: 1 }
        }
    }

    const scoreRange = getScoreRange()
    const currentYear = new Date().getFullYear()
    const formats = currentType === MediaType.ANIME ? ANIME_FORMATS : MANGA_FORMATS

    const hasActiveFilters = !!(
        filters.search ||
        filters.status?.length ||
        filters.format?.length ||
        filters.genre?.length ||
        filters.country?.length ||
        filters.year?.start ||
        filters.year?.end ||
        filters.score?.min ||
        filters.score?.max
    )

    return (
        <div className="w-80 md:w-80 sm:w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-full overflow-visible flex-shrink-0 hidden md:block relative">
            <div className="p-4 space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <Filter className="h-5 w-5" />
                        Filters
                    </h2>
                    {hasActiveFilters && (
                        <button
                            onClick={clearFilters}
                            className="text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                        >
                            Clear All
                        </button>
                    )}
                </div>

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search titles..."
                        value={filters.search || ''}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    />
                    {filters.search && (
                        <button
                            onClick={() => handleSearchChange('')}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                {/* Media Type Toggle */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Media Type
                    </label>
                    <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                        <button
                            onClick={() => setCurrentType(MediaType.ANIME)}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                                currentType === MediaType.ANIME
                                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                            }`}
                        >
                            <Tv className="h-4 w-4" />
                            Anime
                        </button>
                        <button
                            onClick={() => setCurrentType(MediaType.MANGA)}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                                currentType === MediaType.MANGA
                                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                            }`}
                        >
                            <BookOpen className="h-4 w-4" />
                            Manga
                        </button>
                    </div>
                </div>

                {/* View Controls */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        View
                    </label>
                    <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                                viewMode === 'grid'
                                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                            }`}
                        >
                            <Grid3X3 className="h-4 w-4" />
                            Grid
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                                viewMode === 'list'
                                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                            }`}
                        >
                            <List className="h-4 w-4" />
                            List
                        </button>
                    </div>
                </div>

                {/* Sort Controls */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Sort By
                    </label>
                    <div className="space-y-2">
                        <select
                            value={filters.sortBy || 'title'}
                            onChange={(e) => setFilters({ ...filters, sortBy: e.target.value as any })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                        >
                            <option value="title">Title</option>
                            <option value="score">Score</option>
                            <option value="progress">Progress</option>
                            <option value="startDate">Start Date</option>
                            <option value="updatedAt">Updated</option>
                        </select>
                        <button
                            onClick={() => setFilters({
                                ...filters,
                                sortOrder: filters.sortOrder === 'asc' ? 'desc' : 'asc'
                            })}
                            className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
                        >
                            <ArrowUpDown className="h-4 w-4" />
                            {filters.sortOrder === 'desc' ? 'Descending' : 'Ascending'}
                        </button>
                    </div>
                </div>

                {/* Pop-out Filter Categories */}
                <div className="space-y-1">
                    {/* Status Filter */}
                    <div className="relative">
                        <button
                            onClick={() => togglePopout('status')}
                            className="w-full flex items-center justify-between py-3 px-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors"
                        >
                            <span className="flex items-center gap-2">
                                <Tag className="h-4 w-4" />
                                Status
                                {filters.status?.length && (
                                    <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded-full text-xs">
                                        {filters.status.length}
                                    </span>
                                )}
                            </span>
                            <ChevronRight className="h-4 w-4" />
                        </button>
                        
                        {/* Status Pop-out Panel */}
                        {activePopout === 'status' && (
                            <div className="absolute left-full top-0 ml-2 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 p-4">
                                <div className="space-y-2">
                                    <h3 className="font-medium text-gray-900 dark:text-white">Status</h3>
                                    <div className="space-y-1">
                                        {STATUS_OPTIONS.map(option => (
                                            <label key={option.value} className="flex items-center space-x-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={
                                                        option.value === 'ALL' 
                                                            ? !filters.status?.length 
                                                            : filters.status?.includes(option.value as MediaListStatus) || false
                                                    }
                                                    onChange={() => handleStatusFilter(option.value)}
                                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                />
                                                <span className="text-sm text-gray-700 dark:text-gray-300">{option.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Format Filter */}
                    <div className="relative">
                        <button
                            onClick={() => togglePopout('format')}
                            className="w-full flex items-center justify-between py-3 px-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors"
                        >
                            <span className="flex items-center gap-2">
                                {currentType === MediaType.ANIME ? <Tv className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
                                Format
                                {filters.format?.length && (
                                    <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded-full text-xs">
                                        {filters.format.length}
                                    </span>
                                )}
                            </span>
                            <ChevronRight className="h-4 w-4" />
                        </button>
                        
                        {/* Format Pop-out Panel */}
                        {activePopout === 'format' && (
                            <div className="absolute left-full top-0 ml-2 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 p-4">
                                <div className="space-y-2">
                                    <h3 className="font-medium text-gray-900 dark:text-white">Format</h3>
                                    <div className="space-y-1">
                                        {formats.map(format => (
                                            <label key={format.value} className="flex items-center space-x-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={filters.format?.includes(format.value) || false}
                                                    onChange={() => handleFormatFilter(format.value)}
                                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                />
                                                <span className="text-sm text-gray-700 dark:text-gray-300">{format.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Year Filter with Slider */}
                    <div className="relative">
                        <button
                            onClick={() => togglePopout('year')}
                            className="w-full flex items-center justify-between py-3 px-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors"
                        >
                            <span className="flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                Year
                                {(filters.year?.start || filters.year?.end) && (
                                    <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded-full text-xs">
                                        {filters.year.start || 1950}-{filters.year.end || currentYear}
                                    </span>
                                )}
                            </span>
                            <ChevronRight className="h-4 w-4" />
                        </button>
                        
                        {/* Year Pop-out Panel */}
                        {activePopout === 'year' && (
                            <div className="absolute left-full top-0 ml-2 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 p-4">
                                <div className="space-y-4">
                                    <h3 className="font-medium text-gray-900 dark:text-white">Year Range</h3>
                                    <div className="space-y-4">
                                        <div className="flex items-center space-x-2">
                                            <span className="text-sm text-gray-600 dark:text-gray-400">From:</span>
                                            <input
                                                type="range"
                                                min="1950"
                                                max={currentYear}
                                                value={filters.year?.start || 1950}
                                                onChange={(e) => setFilters({
                                                    ...filters,
                                                    year: { ...filters.year, start: parseInt(e.target.value) }
                                                })}
                                                className="flex-1"
                                            />
                                            <span className="text-sm font-medium text-gray-900 dark:text-white w-12">
                                                {filters.year?.start || 1950}
                                            </span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <span className="text-sm text-gray-600 dark:text-gray-400">To:</span>
                                            <input
                                                type="range"
                                                min="1950"
                                                max={currentYear}
                                                value={filters.year?.end || currentYear}
                                                onChange={(e) => setFilters({
                                                    ...filters,
                                                    year: { ...filters.year, end: parseInt(e.target.value) }
                                                })}
                                                className="flex-1"
                                            />
                                            <span className="text-sm font-medium text-gray-900 dark:text-white w-12">
                                                {filters.year?.end || currentYear}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Score Filter with Slider */}
                    <div className="relative">
                        <button
                            onClick={() => togglePopout('score')}
                            className="w-full flex items-center justify-between py-3 px-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors"
                        >
                            <span className="flex items-center gap-2">
                                <Star className="h-4 w-4" />
                                Score
                                {(filters.score?.min || filters.score?.max) && (
                                    <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded-full text-xs">
                                        {filters.score.min || scoreRange.min}-{filters.score.max || scoreRange.max}
                                    </span>
                                )}
                            </span>
                            <ChevronRight className="h-4 w-4" />
                        </button>
                        
                        {/* Score Pop-out Panel */}
                        {activePopout === 'score' && (
                            <div className="absolute left-full top-0 ml-2 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 p-4">
                                <div className="space-y-4">
                                    <h3 className="font-medium text-gray-900 dark:text-white">Score Range</h3>
                                    <div className="space-y-4">
                                        <div className="flex items-center space-x-2">
                                            <span className="text-sm text-gray-600 dark:text-gray-400">Min:</span>
                                            <input
                                                type="range"
                                                min={scoreRange.min}
                                                max={scoreRange.max}
                                                step={scoreRange.step}
                                                value={filters.score?.min || scoreRange.min}
                                                onChange={(e) => setFilters({
                                                    ...filters,
                                                    score: { ...filters.score, min: parseFloat(e.target.value) }
                                                })}
                                                className="flex-1"
                                            />
                                            <span className="text-sm font-medium text-gray-900 dark:text-white w-12">
                                                {filters.score?.min || scoreRange.min}
                                            </span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <span className="text-sm text-gray-600 dark:text-gray-400">Max:</span>
                                            <input
                                                type="range"
                                                min={scoreRange.min}
                                                max={scoreRange.max}
                                                step={scoreRange.step}
                                                value={filters.score?.max || scoreRange.max}
                                                onChange={(e) => setFilters({
                                                    ...filters,
                                                    score: { ...filters.score, max: parseFloat(e.target.value) }
                                                })}
                                                className="flex-1"
                                            />
                                            <span className="text-sm font-medium text-gray-900 dark:text-white w-12">
                                                {filters.score?.max || scoreRange.max}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* More filters can be added here following the same pattern */}
                </div>
            </div>

            {/* Backdrop to close popouts */}
            {activePopout && (
                <div 
                    className="fixed inset-0 bg-transparent z-40"
                    onClick={() => setActivePopout(null)}
                />
            )}
        </div>
    )
}