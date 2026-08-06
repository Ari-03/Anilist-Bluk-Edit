import { useStore } from '@/store'
import { MediaType, MediaListStatus } from '@/types/anilist'
import { getStatusLabel } from '@/lib/anilist'
import CheckboxList from '@/components/sidebar/CheckboxList'
import { Eye, EyeOff } from 'lucide-react'

export default function StatusFilter() {
    const {
        currentType,
        filters,
        setFilters,
        user,
        getCurrentLists,
        showHiddenFromStatusLists,
        setShowHiddenFromStatusLists,
    } = useStore()

    const hiddenEntriesCount = getCurrentLists().filter(e => e.hiddenFromStatusLists).length
    const mediaListOptions = currentType === MediaType.ANIME
        ? user?.mediaListOptions?.animeList
        : user?.mediaListOptions?.mangaList
    const customLists = mediaListOptions?.customLists || []

    const toggle = (status: string) => {
        const statusArray = filters.status || []
        const value = status as MediaListStatus
        setFilters({
            status: statusArray.includes(value)
                ? statusArray.filter(s => s !== value)
                : [...statusArray, value],
        })
    }

    const statusOptions = Object.values(MediaListStatus).map(status => ({
        value: status,
        label: getStatusLabel(status, currentType),
    }))

    return (
        <div className="space-y-3">
            <h3 className="text-sm font-semibold text-fg">Status</h3>
            <div className="max-h-72 overflow-y-auto space-y-3">
                <CheckboxList
                    options={statusOptions}
                    selected={filters.status || []}
                    onToggle={toggle}
                />

                {customLists.length > 0 && (
                    <div>
                        <h4 className="text-xs font-semibold text-fg-muted uppercase tracking-wide px-2 mb-1">
                            Custom lists · {currentType === MediaType.ANIME ? 'Anime' : 'Manga'}
                        </h4>
                        <CheckboxList
                            options={customLists.map(list => ({ value: list, label: list }))}
                            selected={filters.status || []}
                            onToggle={toggle}
                        />
                    </div>
                )}

                {hiddenEntriesCount > 0 && (
                    <label className="flex items-center gap-2.5 cursor-pointer rounded-md px-2 py-1.5 hover:bg-raised transition-colors border-t border-edge pt-3">
                        <input
                            type="checkbox"
                            checked={showHiddenFromStatusLists}
                            onChange={() => setShowHiddenFromStatusLists(!showHiddenFromStatusLists)}
                            className="checkbox"
                        />
                        <span className="text-sm text-fg flex items-center gap-2">
                            {showHiddenFromStatusLists ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                            Show hidden entries ({hiddenEntriesCount})
                        </span>
                    </label>
                )}
            </div>
        </div>
    )
}
