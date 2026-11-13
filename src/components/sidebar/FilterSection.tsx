import { ReactNode } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { m } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FilterSectionProps {
    icon: ReactNode
    label: string
    badge?: string | number | null
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Expand below the row instead of opening a flyout (used in the drawer) */
    inline?: boolean
    popoverClassName?: string
    children: ReactNode
}

/**
 * Sidebar row that opens its filter. In the desktop sidebar it is a flyout:
 * Radix places it to the right (flipping or shifting when it doesn't fit),
 * caps it to the available height, and handles focus, Escape and outside
 * clicks. In the drawer (`inline`) it expands in place, so nothing spills
 * past the drawer's edge.
 */
export default function FilterSection({
    icon,
    label,
    badge,
    open,
    onOpenChange,
    inline = false,
    popoverClassName = 'w-80',
    children,
}: FilterSectionProps) {
    const trigger = (
        <button
            onClick={inline ? () => onOpenChange(!open) : undefined}
            aria-expanded={open}
            className={cn(
                'w-full flex items-center justify-between h-10 touch:h-11 px-3 rounded-lg text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                open ? 'bg-raised text-fg' : 'text-fg-muted hover:bg-raised hover:text-fg'
            )}
        >
            <span className="flex items-center gap-2.5">
                {icon}
                {label}
                {badge != null && badge !== '' && (
                    <span className="inline-flex items-center rounded-full bg-accent/15 text-accent-strong px-2 py-0.5 text-xs font-semibold tabular-nums">
                        {badge}
                    </span>
                )}
            </span>
            <ChevronRight className={cn('h-4 w-4 transition-transform duration-150', open && 'rotate-90')} aria-hidden />
        </button>
    )

    if (inline) {
        return (
            <div>
                {trigger}
                {open && <div className="px-3 pt-2 pb-3">{children}</div>}
            </div>
        )
    }

    return (
        <Popover.Root open={open} onOpenChange={onOpenChange}>
            <Popover.Trigger asChild>{trigger}</Popover.Trigger>

            <Popover.Portal>
                <Popover.Content
                    side="right"
                    align="start"
                    sideOffset={8}
                    collisionPadding={8}
                    aria-label={`${label} filter`}
                    className="z-popover focus:outline-none"
                >
                    <m.div
                        className={cn(
                            'card p-4 shadow-overlay overflow-y-auto max-h-[var(--radix-popover-content-available-height)]',
                            popoverClassName
                        )}
                        initial={{ opacity: 0, scale: 0.96, x: -4 }}
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        transition={{ duration: 0.14, ease: 'easeOut' }}
                    >
                        {children}
                    </m.div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    )
}
