import { useId, type ReactNode } from 'react'
import {
  AnimatePresence,
  domMax,
  LayoutGroup,
  LazyMotion,
  m,
  MotionConfig,
} from 'motion/react'

import type {
  MediaListEntry,
  MediaListEntryId,
} from '@/modules/media-list'

import { MediaCard } from './MediaCard'

export interface MediaEntriesProps {
  entries: readonly MediaListEntry[]
  viewMode: 'grid' | 'list'
  bulkMode: boolean
  selectedIds: ReadonlySet<MediaListEntryId>
  onToggleSelection?: (entryId: MediaListEntryId) => void
  onEdit?: (entryId: MediaListEntryId) => void
  onDelete?: (entryId: MediaListEntryId) => void
  onFindRelated?: (entryId: MediaListEntryId) => void
  emptyFallback?: ReactNode
}

export function AnimatedMediaEntries({
  entries,
  viewMode,
  bulkMode,
  selectedIds,
  onToggleSelection,
  onEdit,
  onDelete,
  onFindRelated,
  emptyFallback,
}: MediaEntriesProps) {
  const layoutId = useId()

  return (
    <div data-motion-ready="true">
      <MotionConfig reducedMotion="user">
        <LazyMotion features={domMax}>
          <LayoutGroup id={layoutId}>
            <div
              className={`grid min-w-0 grid-cols-1 gap-3 ${
                viewMode === 'grid' ? '2xl:grid-cols-2' : ''
              }`}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                {entries.map((entry, layoutIndex) => (
                  <m.div
                    key={entry.id}
                    layout="position"
                    layoutDependency={layoutIndex}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{
                      layout: { duration: 0.18, ease: 'easeOut' },
                      opacity: { duration: 0.14 },
                      scale: { duration: 0.14 },
                    }}
                    className="min-w-0"
                  >
                    <MediaCard
                      entry={entry}
                      bulkMode={bulkMode}
                      selected={selectedIds.has(entry.id)}
                      onToggle={onToggleSelection}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onFindRelated={onFindRelated}
                    />
                  </m.div>
                ))}
                {entries.length === 0 && emptyFallback ? (
                  <m.div
                    key="empty-state"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ opacity: { duration: 0.14, delay: 0.14 } }}
                    className="col-span-full"
                  >
                    {emptyFallback}
                  </m.div>
                ) : null}
              </AnimatePresence>
            </div>
          </LayoutGroup>
        </LazyMotion>
      </MotionConfig>
    </div>
  )
}
