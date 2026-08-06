import { cn } from '@/lib/utils'

interface ProgressBarProps {
    value: number
    max: number
    className?: string
    barClassName?: string
    indeterminate?: boolean
}

export default function ProgressBar({ value, max, className, barClassName, indeterminate }: ProgressBarProps) {
    const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
    return (
        <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-edge', className)}>
            {indeterminate ? (
                <div className={cn('h-full w-1/3 rounded-full bg-accent animate-[indeterminate_1.2s_ease-in-out_infinite]', barClassName)} />
            ) : (
                <div
                    className={cn('h-full rounded-full bg-accent transition-[width] duration-300 ease-out', barClassName)}
                    style={{ width: `${pct}%` }}
                />
            )}
        </div>
    )
}
