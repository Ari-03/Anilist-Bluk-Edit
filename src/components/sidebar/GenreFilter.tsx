import { useMemo, useState } from 'react'
import { useStore } from '@/store'
import CheckboxList from '@/components/sidebar/CheckboxList'
import { Search, X } from 'lucide-react'

export default function GenreFilter() {
    const { filters, setFilters, getCurrentLists } = useStore()
    const [search, setSearch] = useState('')

    // Derive genres (with counts) from the user's own library instead of a
    // hardcoded list, so the options always match what can actually be filtered
    const lists = getCurrentLists()
    const genreCounts = useMemo(() => {
        const counts = new Map<string, number>()
        for (const entry of lists) {
            for (const genre of entry.media?.genres || []) {
                counts.set(genre, (counts.get(genre) || 0) + 1)
            }
        }
        return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
    }, [lists])

    const toggle = (genre: string) => {
        const genreArray = filters.genre || []
        setFilters({
            genre: genreArray.includes(genre)
                ? genreArray.filter(g => g !== genre)
                : [...genreArray, genre],
        })
    }

    const visible = genreCounts.filter(([genre]) =>
        genre.toLowerCase().includes(search.toLowerCase())
    )

    return (
        <div className="space-y-3">
            <h3 className="text-sm font-semibold text-fg">Genres</h3>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle" />
                <input
                    type="text"
                    placeholder="Search genres…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="input h-9 pl-9 pr-8 text-sm"
                />
                {search && (
                    <button
                        onClick={() => setSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>

            <div className="max-h-60 overflow-y-auto">
                {visible.length > 0 ? (
                    <CheckboxList
                        options={visible.map(([genre, count]) => ({ value: genre, label: genre, count }))}
                        selected={filters.genre || []}
                        onToggle={toggle}
                    />
                ) : (
                    <p className="text-sm text-fg-muted px-2 py-2">
                        {genreCounts.length === 0 ? 'No genres in your library yet' : `No genres matching “${search}”`}
                    </p>
                )}
            </div>
        </div>
    )
}
