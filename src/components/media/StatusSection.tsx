import { ReactNode } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { MediaListStatus, MediaType } from '@/types/anilist'
import { getStatusColor, getStatusLabel } from '@/lib/anilist'
import { cn } from '@/lib/utils'
import { ChevronDown, Check, Minus } from 'lucide-react'

interface StatusSectionProps {
    status: MediaListStatus
    mediaType: MediaType
    count: number
    collapsed: boolean
    onToggleCollapsed: () => void
    bulkEditMode: boolean
    /** How many of this section's entries are currently selected */
    selectedCount: number
    onSelectSection: () => void
    onDeselectSection: () => void
    children: ReactNode
}

/**
 * Collapsible accordion section grouping entries that share a watch status.
 * In bulk edit mode the header carries a tri-state checkbox that selects or
 * deselects the whole status group at once.
 */
export default function StatusSection({
    status,
    mediaType,
    count,
    collapsed,
    onToggleCollapsed,
    bulkEditMode,
    selectedCount,
    onSelectSection,
    onDeselectSection,
    children,
}: StatusSectionProps) {
    const allSelected = count > 0 && selectedCount === count
    const someSelected = selectedCount > 0 && !allSelected

    return (
        <section>
            <div className="flex items-center gap-2.5">
                {bulkEditMode && (
                    <button
                        onClick={allSelected ? onDeselectSection : onSelectSection}
                        className={cn(
                            'flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center border-2 transition-all duration-150',
                            allSelected || someSelected
                                ? 'bg-purple border-purple text-white'
                                : 'border-edge text-transparent hover:border-purple'
                        )}
                        title={allSelected ? 'Deselect all in this section' : 'Select all in this section'}
                    >
                        {someSelected ? (
                            <Minus className="w-3 h-3" strokeWidth={3} />
                        ) : (
                            <Check className="w-3 h-3" strokeWidth={3} />
                        )}
                    </button>
                )}
                <button
                    onClick={onToggleCollapsed}
                    className="flex flex-1 items-center gap-2.5 py-2 text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    title={collapsed ? 'Expand section' : 'Collapse section'}
                >
                    <span className={cn('w-2 h-2 rounded-full flex-shrink-0', getStatusColor(status))} />
                    <span className="text-sm font-semibold text-fg">{getStatusLabel(status, mediaType)}</span>
                    <span className="text-xs text-fg-muted tabular-nums">{count}</span>
                    <span className="flex-1 h-px bg-edge" />
                    <ChevronDown
                        className={cn(
                            'w-4 h-4 text-fg-muted transition-transform duration-200',
                            collapsed && '-rotate-90'
                        )}
                    />
                </button>
            </div>

            <AnimatePresence initial={false}>
                {!collapsed && (
                    <m.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        /* -mx-1 + inner px-1 keep card rings/shadows clear of the clip edge */
                        className="overflow-hidden -mx-1"
                    >
                        <div className="px-1 py-1">{children}</div>
                    </m.div>
                )}
            </AnimatePresence>
        </section>
    )
}
