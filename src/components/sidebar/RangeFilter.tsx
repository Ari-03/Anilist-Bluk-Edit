import RangeSlider from '@/components/ui/RangeSlider'

interface RangeFilterProps {
    title: string
    min: number
    max: number
    step?: number
    value: [number, number]
    onChange: (value: [number, number]) => void
    fromLabel?: string
    toLabel?: string
}

/** Shared body for the Year and Score popouts: two number inputs + dual slider */
export default function RangeFilter({
    title,
    min,
    max,
    step = 1,
    value,
    onChange,
    fromLabel = 'From',
    toLabel = 'To',
}: RangeFilterProps) {
    const parse = step < 1 ? parseFloat : (v: string) => parseInt(v)

    return (
        <div className="space-y-4">
            <h3 className="text-sm font-semibold text-fg">{title}</h3>

            <div className="flex items-center gap-3">
                <div className="flex-1">
                    <label className="block text-xs text-fg-muted mb-1">{fromLabel}</label>
                    <input
                        type="number"
                        className="input h-9 text-sm"
                        min={min}
                        max={value[1]}
                        step={step}
                        value={value[0]}
                        onChange={(e) => {
                            const v = parse(e.target.value)
                            if (!isNaN(v)) onChange([v, value[1]])
                        }}
                    />
                </div>
                <div className="flex-1">
                    <label className="block text-xs text-fg-muted mb-1">{toLabel}</label>
                    <input
                        type="number"
                        className="input h-9 text-sm"
                        min={value[0]}
                        max={max}
                        step={step}
                        value={value[1]}
                        onChange={(e) => {
                            const v = parse(e.target.value)
                            if (!isNaN(v)) onChange([value[0], v])
                        }}
                    />
                </div>
            </div>

            <div className="px-1 pb-1">
                <RangeSlider
                    aria-label={title}
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={onChange}
                />
            </div>
        </div>
    )
}
