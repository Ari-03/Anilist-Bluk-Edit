import React, { useState, useEffect } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { useStore } from '@/store'
import { MediaType, MediaListStatus, MediaFormat } from '@/types/anilist'
import { Slider, InputNumber, ConfigProvider } from 'antd'
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
    ChevronRight,
    Eye,
    EyeOff,
    ChevronLeft
} from 'lucide-react'

interface LeftSidebarProps {
    onClose?: () => void
    isMobile?: boolean
    isOpen?: boolean
}

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

function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(false)

    useEffect(() => {
        const media = window.matchMedia(query)
        setMatches(media.matches)

        const listener = (e: MediaQueryListEvent) => setMatches(e.matches)
        media.addEventListener('change', listener)
        return () => media.removeEventListener('change', listener)
    }, [query])

    return matches
}

interface FilterPopoverProps {
    trigger: React.ReactNode
    children: React.ReactNode
    wide?: boolean
}

function FilterPopover({ trigger, children, wide }: FilterPopoverProps) {
    const isMobile = useMediaQuery('(max-width: 1024px)')

    return (
        <Popover.Root>
            <Popover.Trigger asChild>
                {trigger}
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    className={`popover-content ${wide ? 'popover-content-wide' : ''}`}
                    side={isMobile ? 'bottom' : 'right'}
                    sideOffset={8}
                    align="start"
                    alignOffset={-4}
                    collisionPadding={16}
                >
                    {children}
                    <Popover.Arrow className="popover-arrow" width={12} height={6} />
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    )
}

export default function LeftSidebar({ onClose, isMobile = false, isOpen = true }: LeftSidebarProps) {
    const {
        currentType,
        setCurrentType,
        viewMode,
        setViewMode,
        filters,
        setFilters,
        clearFilters,
        user,
        getCurrentLists,
        showHiddenFromStatusLists,
        setShowHiddenFromStatusLists
    } = useStore()

    const [genreSearch, setGenreSearch] = useState<string>('')

    const hiddenEntriesCount = getCurrentLists().filter(entry => entry.hiddenFromStatusLists).length

    const getYearRange = () => {
        const lists = getCurrentLists()
        const currentYear = new Date().getFullYear()

        if (lists.length === 0) {
            return { min: 1975, max: currentYear + 1 }
        }

        const years = lists
            .map(entry => entry.media?.startDate?.year || entry.media?.seasonYear)
            .filter((year): year is number => year !== undefined && year !== null)

        if (years.length === 0) {
            return { min: 1975, max: currentYear + 1 }
        }

        return {
            min: Math.min(...years),
            max: Math.max(...years, currentYear + 1)
        }
    }

    const yearRange = getYearRange()

    const getStatusOptions = () => {
        const baseOptions = [
            { value: MediaListStatus.CURRENT, label: 'Current' },
            { value: MediaListStatus.PLANNING, label: 'Planning' },
            { value: MediaListStatus.COMPLETED, label: 'Completed' },
            { value: MediaListStatus.DROPPED, label: 'Dropped' },
            { value: MediaListStatus.PAUSED, label: 'Paused' },
            { value: MediaListStatus.REPEATING, label: 'Repeating' }
        ];

        return baseOptions;
    }

    const mediaListOptions = currentType === 'ANIME' ? user?.mediaListOptions?.animeList : user?.mediaListOptions?.mangaList;
    const customLists = mediaListOptions?.customLists || [];
    const STATUS_OPTIONS = getStatusOptions();

    const COUNTRIES = [
        { value: 'JP', label: 'Japan' },
        { value: 'KR', label: 'South Korea' },
        { value: 'CN', label: 'China' },
        { value: 'TW', label: 'Taiwan' }
    ]

    const COMMON_GENRES = [
        'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror',
        'Mystery', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural',
        'Thriller', 'Ecchi', 'Harem', 'Josei', 'Kids', 'Mecha', 'Military',
        'Music', 'Parody', 'Police', 'Psychological', 'School', 'Seinen',
        'Shoujo', 'Shounen', 'Space', 'Super Power', 'Vampire', 'Yaoi', 'Yuri'
    ]

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

    const filterButtonClass = "w-full flex items-center justify-between py-2.5 px-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-base font-medium text-gray-700 dark:text-gray-300 transition-colors"

    return (
        <div className={`${isMobile ? 'w-full' : 'w-80'} bg-white dark:bg-gray-800 h-full flex flex-col relative`}>
            {!isMobile && onClose && isOpen && (
                <button
                    onClick={onClose}
                    className="sidebar-drag-handle sidebar-drag-handle-left"
                    aria-label="Close filters"
                >
                    <ChevronLeft className="w-4 h-4" />
                </button>
            )}
            <div className="p-4 space-y-4 overflow-y-auto flex-1">
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

                <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Media Type
                    </label>
                    <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                        <button
                            onClick={() => setCurrentType(MediaType.ANIME)}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${currentType === MediaType.ANIME
                                ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                }`}
                        >
                            <Tv className="h-4 w-4" />
                            Anime
                        </button>
                        <button
                            onClick={() => setCurrentType(MediaType.MANGA)}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${currentType === MediaType.MANGA
                                ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                }`}
                        >
                            <BookOpen className="h-4 w-4" />
                            Manga
                        </button>
                    </div>
                </div>

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

                <div className="space-y-1">
                    <FilterPopover
                        trigger={
                            <button className={filterButtonClass}>
                                <span className="flex items-center gap-2">
                                    <Tag className="h-4 w-4" />
                                    Status
                                    {filters.status && filters.status.length > 0 && (
                                        <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded-full text-xs">
                                            {filters.status.length}
                                        </span>
                                    )}
                                </span>
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        }
                    >
                        <div className="space-y-2">
                            <h3 className="font-medium text-gray-900 dark:text-white text-lg">Status</h3>
                            <div className="max-h-60 overflow-y-auto space-y-1">
                                {STATUS_OPTIONS.map(option => (
                                    <label key={option.value} className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 p-1.5 rounded-md transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={filters.status?.includes(option.value as MediaListStatus) || false}
                                            onChange={() => handleStatusFilter(option.value)}
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-5 h-5"
                                        />
                                        <span className="text-base text-gray-700 dark:text-gray-300">{option.label}</span>
                                    </label>
                                ))}
                                {customLists.length > 0 && (
                                    <>
                                        <h4 className="font-medium text-gray-900 dark:text-white text-md pt-2">Custom Lists</h4>
                                        {customLists.map(list => (
                                            <label key={list} className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 p-1.5 rounded-md transition-colors">
                                                <input
                                                    type="checkbox"
                                                    checked={filters.status?.includes(list as MediaListStatus) || false}
                                                    onChange={() => handleStatusFilter(list)}
                                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-5 h-5"
                                                />
                                                <span className="text-base text-gray-700 dark:text-gray-300">{list}</span>
                                            </label>
                                        ))}
                                    </>
                                )}

                                {hiddenEntriesCount > 0 && (
                                    <>
                                        <div className="border-t border-gray-200 dark:border-gray-600 my-2" />
                                        <label className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 p-1.5 rounded-md transition-colors">
                                            <input
                                                type="checkbox"
                                                checked={showHiddenFromStatusLists}
                                                onChange={() => setShowHiddenFromStatusLists(!showHiddenFromStatusLists)}
                                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-5 h-5"
                                            />
                                            <span className="text-base text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                                {showHiddenFromStatusLists ? (
                                                    <Eye className="w-4 h-4" />
                                                ) : (
                                                    <EyeOff className="w-4 h-4" />
                                                )}
                                                {showHiddenFromStatusLists ? 'Hide' : 'Show'} Hidden Entries
                                            </span>
                                        </label>
                                    </>
                                )}
                            </div>
                        </div>
                    </FilterPopover>

                    <FilterPopover
                        trigger={
                            <button className={filterButtonClass}>
                                <span className="flex items-center gap-2">
                                    <Tag className="h-4 w-4" />
                                    Genre
                                    {filters.genre && filters.genre.length > 0 && (
                                        <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded-full text-xs">
                                            {filters.genre.length}
                                        </span>
                                    )}
                                </span>
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        }
                    >
                        <div className="space-y-3">
                            <h3 className="font-medium text-gray-900 dark:text-white text-lg">Genres</h3>

                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search genres..."
                                    value={genreSearch}
                                    onChange={(e) => setGenreSearch(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-base"
                                />
                                {genreSearch && (
                                    <button
                                        onClick={() => setGenreSearch('')}
                                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        <X className="h-5 w-5" />
                                    </button>
                                )}
                            </div>

                            <div className="max-h-48 overflow-y-auto space-y-1">
                                {COMMON_GENRES
                                    .filter(genre =>
                                        genre.toLowerCase().includes(genreSearch.toLowerCase())
                                    )
                                    .map(genre => (
                                        <label key={genre} className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 p-1.5 rounded-md transition-colors">
                                            <input
                                                type="checkbox"
                                                checked={filters.genre?.includes(genre) || false}
                                                onChange={() => handleGenreFilter(genre)}
                                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-5 h-5"
                                            />
                                            <span className="text-base text-gray-700 dark:text-gray-300">{genre}</span>
                                        </label>
                                    ))
                                }
                                {COMMON_GENRES.filter(genre =>
                                    genre.toLowerCase().includes(genreSearch.toLowerCase())
                                ).length === 0 && (
                                    <p className="text-base text-gray-500 dark:text-gray-400 py-2">
                                        No genres found matching &quot;{genreSearch}&quot;
                                    </p>
                                )}
                            </div>
                        </div>
                    </FilterPopover>

                    <FilterPopover
                        trigger={
                            <button className={filterButtonClass}>
                                <span className="flex items-center gap-2">
                                    {currentType === MediaType.ANIME ? <Tv className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
                                    Format
                                    {filters.format && filters.format.length > 0 && (
                                        <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded-full text-xs">
                                            {filters.format.length}
                                        </span>
                                    )}
                                </span>
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        }
                    >
                        <div className="space-y-2">
                            <h3 className="font-medium text-gray-900 dark:text-white text-lg">Format</h3>
                            <div className="space-y-1">
                                {formats.map(format => (
                                    <label key={format.value} className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 p-1.5 rounded-md transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={filters.format?.includes(format.value) || false}
                                            onChange={() => handleFormatFilter(format.value)}
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-5 h-5"
                                        />
                                        <span className="text-base text-gray-700 dark:text-gray-300">{format.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </FilterPopover>

                    <FilterPopover
                        trigger={
                            <button className={filterButtonClass}>
                                <span className="flex items-center gap-2">
                                    <Globe className="h-4 w-4" />
                                    Country
                                    {filters.country && filters.country.length > 0 && (
                                        <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded-full text-xs">
                                            {filters.country.length}
                                        </span>
                                    )}
                                </span>
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        }
                    >
                        <div className="space-y-2">
                            <h3 className="font-medium text-gray-900 dark:text-white text-lg">Country</h3>
                            <div className="space-y-1">
                                {COUNTRIES.map(country => (
                                    <label key={country.value} className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 p-1.5 rounded-md transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={filters.country?.includes(country.value) || false}
                                            onChange={() => handleCountryFilter(country.value)}
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-5 h-5"
                                        />
                                        <span className="text-base text-gray-700 dark:text-gray-300">{country.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </FilterPopover>

                    <FilterPopover
                        wide
                        trigger={
                            <button className={filterButtonClass}>
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
                        }
                    >
                        <div className="space-y-4">
                            <h3 className="font-medium text-gray-900 dark:text-white text-lg">
                                Year Range
                            </h3>

                            <div className="flex items-center gap-4">
                                <div className="flex-1">
                                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">From:</label>
                                    <InputNumber
                                        min={yearRange.min}
                                        max={filters.year?.end || yearRange.max}
                                        value={filters.year?.start || yearRange.min}
                                        onChange={(value) => {
                                            if (value !== null) {
                                                setFilters({
                                                    ...filters,
                                                    year: {
                                                        start: value,
                                                        end: filters.year?.end || yearRange.max
                                                    }
                                                })
                                            }
                                        }}
                                        size="small"
                                        className="w-full"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">To:</label>
                                    <InputNumber
                                        min={filters.year?.start || yearRange.min}
                                        max={yearRange.max}
                                        value={filters.year?.end || yearRange.max}
                                        onChange={(value) => {
                                            if (value !== null) {
                                                setFilters({
                                                    ...filters,
                                                    year: {
                                                        start: filters.year?.start || yearRange.min,
                                                        end: value
                                                    }
                                                })
                                            }
                                        }}
                                        size="small"
                                        className="w-full"
                                    />
                                </div>
                            </div>

                            <div className="px-2">
                                <ConfigProvider
                                    theme={{
                                        components: {
                                            Slider: {
                                                railSize: 8,
                                                railBg: 'rgb(229, 231, 235)',
                                                railHoverBg: 'rgb(209, 213, 219)',
                                                trackBg: 'rgb(59, 130, 246)',
                                                trackHoverBg: 'rgb(37, 99, 235)',
                                                handleSize: 16,
                                                handleSizeHover: 18,
                                                handleColor: 'rgb(59, 130, 246)',
                                                handleActiveColor: 'rgb(29, 78, 216)',
                                                handleLineWidth: 2,
                                                handleLineWidthHover: 3
                                            }
                                        }
                                    }}
                                >
                                    <Slider
                                        range
                                        tooltip={{ placement: "bottom" }}
                                        min={yearRange.min}
                                        max={yearRange.max}
                                        value={[filters.year?.start || yearRange.min, filters.year?.end || yearRange.max]}
                                        onChange={(value) => {
                                            if (Array.isArray(value)) {
                                                setFilters({
                                                    ...filters,
                                                    year: { start: value[0], end: value[1] }
                                                })
                                            }
                                        }}
                                    />
                                </ConfigProvider>
                            </div>
                        </div>
                    </FilterPopover>

                    <FilterPopover
                        wide
                        trigger={
                            <button className={filterButtonClass}>
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
                        }
                    >
                        <div className="space-y-4">
                            <h3 className="font-medium text-gray-900 dark:text-white text-lg">
                                Score Range
                            </h3>

                            <div className="flex items-center gap-4">
                                <div className="flex-1">
                                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Min:</label>
                                    <InputNumber
                                        min={scoreRange.min}
                                        max={filters.score?.max || scoreRange.max}
                                        step={scoreRange.step}
                                        value={filters.score?.min || scoreRange.min}
                                        onChange={(value) => {
                                            if (value !== null) {
                                                setFilters({
                                                    ...filters,
                                                    score: {
                                                        min: value,
                                                        max: filters.score?.max || scoreRange.max
                                                    }
                                                })
                                            }
                                        }}
                                        size="small"
                                        className="w-full"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Max:</label>
                                    <InputNumber
                                        min={filters.score?.min || scoreRange.min}
                                        max={scoreRange.max}
                                        step={scoreRange.step}
                                        value={filters.score?.max || scoreRange.max}
                                        onChange={(value) => {
                                            if (value !== null) {
                                                setFilters({
                                                    ...filters,
                                                    score: {
                                                        min: filters.score?.min || scoreRange.min,
                                                        max: value
                                                    }
                                                })
                                            }
                                        }}
                                        size="small"
                                        className="w-full"
                                    />
                                </div>
                            </div>

                            <div className="px-2">
                                <ConfigProvider
                                    theme={{
                                        components: {
                                            Slider: {
                                                railSize: 8,
                                                railBg: 'rgb(229, 231, 235)',
                                                railHoverBg: 'rgb(209, 213, 219)',
                                                trackBg: 'rgb(59, 130, 246)',
                                                trackHoverBg: 'rgb(37, 99, 235)',
                                                handleSize: 16,
                                                handleSizeHover: 18,
                                                handleColor: 'rgb(59, 130, 246)',
                                                handleActiveColor: 'rgb(29, 78, 216)',
                                                handleLineWidth: 2,
                                                handleLineWidthHover: 3
                                            }
                                        }
                                    }}
                                >
                                    <Slider
                                        range
                                        tooltip={{ placement: "bottom" }}
                                        min={scoreRange.min}
                                        max={scoreRange.max}
                                        step={scoreRange.step}
                                        value={[filters.score?.min || scoreRange.min, filters.score?.max || scoreRange.max]}
                                        onChange={(value) => {
                                            if (Array.isArray(value)) {
                                                setFilters({
                                                    ...filters,
                                                    score: { min: value[0], max: value[1] }
                                                })
                                            }
                                        }}
                                    />
                                </ConfigProvider>
                            </div>
                        </div>
                    </FilterPopover>
                </div>

                <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="space-y-2">
                        <label className="text-base font-medium text-gray-700 dark:text-gray-300">
                            View Mode
                        </label>
                        <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`flex-1 flex items-center justify-center gap-2 py-1.5 px-2 rounded-md text-sm font-medium transition-colors ${viewMode === 'grid'
                                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                    }`}
                            >
                                <Grid3X3 className="h-3.5 w-3.5" />
                                Grid
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`flex-1 flex items-center justify-center gap-2 py-1.5 px-2 rounded-md text-sm font-medium transition-colors ${viewMode === 'list'
                                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                    }`}
                            >
                                <List className="h-3.5 w-3.5" />
                                List
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
