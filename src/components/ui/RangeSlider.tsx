import * as Slider from '@radix-ui/react-slider'

interface RangeSliderProps {
    min: number
    max: number
    step?: number
    value: [number, number]
    onChange: (value: [number, number]) => void
    'aria-label'?: string
}

export default function RangeSlider({ min, max, step = 1, value, onChange, ...rest }: RangeSliderProps) {
    return (
        <Slider.Root
            className="relative flex items-center select-none touch-none w-full h-5"
            min={min}
            max={max}
            step={step}
            value={value}
            onValueChange={(v) => onChange([v[0], v[1]])}
        >
            <Slider.Track className="relative grow rounded-full h-1.5 bg-edge">
                <Slider.Range className="absolute h-full rounded-full bg-accent" />
            </Slider.Track>
            {[0, 1].map((i) => (
                <Slider.Thumb
                    key={i}
                    aria-label={rest['aria-label'] ? `${rest['aria-label']} ${i === 0 ? 'minimum' : 'maximum'}` : undefined}
                    className="block w-4 h-4 rounded-full bg-white border-2 border-accent shadow-card transition-transform duration-100 hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                />
            ))}
        </Slider.Root>
    )
}
