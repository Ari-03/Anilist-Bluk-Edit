import { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import Popover, { PopoverPosition } from '@/components/ui/Popover'
import { cn } from '@/lib/utils'

interface FilterSectionProps {
    icon: ReactNode
    label: string
    badge?: string | number | null
    open: boolean
    position: PopoverPosition | null
    onTrigger: (e: React.MouseEvent<HTMLButtonElement>) => void
    onClose: () => void
    popoverClassName?: string
    children: ReactNode
}

export default function FilterSection({
    icon,
    label,
    badge,
    open,
    position,
    onTrigger,
    onClose,
    popoverClassName = 'w-80',
    children,
}: FilterSectionProps) {
    return (
        <div className="relative">
            <button
                onClick={onTrigger}
                className={cn(
                    'w-full flex items-center justify-between h-10 px-3 rounded-lg text-sm font-medium transition-colors duration-150',
                    open ? 'bg-raised text-fg' : 'text-fg-muted hover:bg-raised hover:text-fg'
                )}
            >
                <span className="flex items-center gap-2.5">
                    {icon}
                    {label}
                    {badge != null && badge !== '' && (
                        <span className="inline-flex items-center rounded-full bg-accent/15 text-accent px-2 py-0.5 text-[11px] font-semibold tabular-nums">
                            {badge}
                        </span>
                    )}
                </span>
                <ChevronRight className={cn('h-4 w-4 transition-transform duration-150', open && 'rotate-90')} />
            </button>

            <Popover open={open} position={position} onClose={onClose} className={popoverClassName}>
                {children}
            </Popover>
        </div>
    )
}
