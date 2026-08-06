interface CheckboxOption {
    value: string
    label: string
    count?: number
}

interface CheckboxListProps {
    options: CheckboxOption[]
    selected: string[]
    onToggle: (value: string) => void
}

export default function CheckboxList({ options, selected, onToggle }: CheckboxListProps) {
    return (
        <div className="space-y-0.5">
            {options.map(option => (
                <label
                    key={option.value}
                    className="flex items-center gap-2.5 cursor-pointer rounded-md px-2 py-1.5 hover:bg-raised transition-colors"
                >
                    <input
                        type="checkbox"
                        checked={selected.includes(option.value)}
                        onChange={() => onToggle(option.value)}
                        className="checkbox"
                    />
                    <span className="flex-1 text-sm text-fg">{option.label}</span>
                    {option.count !== undefined && (
                        <span className="text-xs text-fg-subtle tabular-nums">{option.count}</span>
                    )}
                </label>
            ))}
        </div>
    )
}
