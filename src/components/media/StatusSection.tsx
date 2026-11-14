import { ReactNode, useState } from 'react'
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
    /** True while the collapse or expand animation runs */
    const [resizing, setResizing] = useState(false)
    // Start clipping whenever `collapsed` changes, however it changed: the header below,
    // or a switch between anime and manga, which keep their own collapsed sections
    const [wasCollapsed, setWasCollapsed] = useState(collapsed)
    if (wasCollapsed !== collapsed) {
        setWasCollapsed(collapsed)
        setResizing(true)
    }
    const allSelected = count > 0 && selectedCount === count
    const someSelected = selectedCount > 0 && !allSelected

    return (
        <section>
            {/* Sticky under the 64px app header so long sections keep their label */}
            <div className="sticky top-16 z-10 -mx-1 px-1 flex items-center gap-2.5 bg-page/95 backdrop-blur-sm">
                {bulkEditMode && (
                    <button
                        role="checkbox"
                        aria-checked={allSelected ? true : someSelected ? 'mixed' : false}
                        aria-label={`Select all ${getStatusLabel(status, mediaType)}`}
                        onClick={allSelected ? onDeselectSection : onSelectSection}
                        className={cn(
                            // The ::before pads the 20px badge out to a 44px touch target
                            'relative flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center border-2 transition-all duration-150 before:absolute before:-inset-3',
                            allSelected || someSelected
                                ? 'bg-tint border-tint text-white'
                                : 'border-edge-strong text-transparent hover:border-tint'
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
                    aria-expanded={!collapsed}
                    className="flex flex-1 items-center gap-2.5 py-2 touch:min-h-11 text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    title={collapsed ? 'Expand section' : 'Collapse section'}
                >
                    <span className={cn('w-2 h-2 rounded-full flex-shrink-0', getStatusColor(status))} />
                    <span className="text-sm font-semibold text-fg">{getStatusLabel(status, mediaType)}</span>
                    <span className="text-xs text-fg-muted tabular-nums">
                        {bulkEditMode && selectedCount > 0 ? `${selectedCount} of ${count} selected` : count}
                    </span>
                    <span className="flex-1 h-px bg-edge" />
                    <ChevronDown
                        className={cn(
                            'w-4 h-4 text-fg-muted transition-transform duration-200',
                            collapsed && '-rotate-90'
                        )}
                    />
                </button>
            </div>

            {/* Clipped only while collapsing or expanding. At rest the contents may paint
                outside, so entries can glide between sections (ListMotion) and card
                shadows are not cut off at the section's edge. The clip sits on this
                wrapper because AnimatePresence freezes the props of an exiting child. */}
            <div className={cn('-mx-1', resizing && 'overflow-hidden')}>
                <AnimatePresence initial={false} onExitComplete={() => setResizing(false)}>
                    {!collapsed && (
                        <m.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: 'easeOut' }}
                            onAnimationComplete={() => setResizing(false)}
                        >
                            <div className="px-1 py-1">{children}</div>
                        </m.div>
                    )}
                </AnimatePresence>
            </div>
        </section>
    )
}
