import { useStore } from '@/store'
import { MediaType, MediaFormat } from '@/types/anilist'
import CheckboxList from '@/components/sidebar/CheckboxList'

const ANIME_FORMATS = [
    { value: MediaFormat.TV, label: 'TV Series' },
    { value: MediaFormat.MOVIE, label: 'Movie' },
    { value: MediaFormat.OVA, label: 'OVA' },
    { value: MediaFormat.ONA, label: 'ONA' },
    { value: MediaFormat.SPECIAL, label: 'Special' },
    { value: MediaFormat.TV_SHORT, label: 'TV Short' },
    { value: MediaFormat.MUSIC, label: 'Music' },
]

const MANGA_FORMATS = [
    { value: MediaFormat.MANGA, label: 'Manga' },
    { value: MediaFormat.NOVEL, label: 'Light Novel' },
    { value: MediaFormat.ONE_SHOT, label: 'One Shot' },
]

export default function FormatFilter() {
    const { currentType, filters, setFilters } = useStore()
    const formats = currentType === MediaType.ANIME ? ANIME_FORMATS : MANGA_FORMATS

    const toggle = (format: string) => {
        const formatArray = filters.format || []
        setFilters({
            format: formatArray.includes(format)
                ? formatArray.filter(f => f !== format)
                : [...formatArray, format],
        })
    }

    return (
        <div className="space-y-3">
            <h3 className="text-sm font-semibold text-fg">Format</h3>
            <CheckboxList options={formats} selected={filters.format || []} onToggle={toggle} />
        </div>
    )
}
