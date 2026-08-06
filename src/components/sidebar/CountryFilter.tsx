import { useStore } from '@/store'
import CheckboxList from '@/components/sidebar/CheckboxList'

export const COUNTRIES = [
    { value: 'JP', label: 'Japan' },
    { value: 'KR', label: 'South Korea' },
    { value: 'CN', label: 'China' },
    { value: 'TW', label: 'Taiwan' },
]

export default function CountryFilter() {
    const { filters, setFilters } = useStore()

    const toggle = (country: string) => {
        const countryArray = filters.country || []
        setFilters({
            country: countryArray.includes(country)
                ? countryArray.filter(c => c !== country)
                : [...countryArray, country],
        })
    }

    return (
        <div className="space-y-3">
            <h3 className="text-sm font-semibold text-fg">Country</h3>
            <CheckboxList options={COUNTRIES} selected={filters.country || []} onToggle={toggle} />
        </div>
    )
}
