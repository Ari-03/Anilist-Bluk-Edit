import dynamic from 'next/dynamic'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  RefreshCw,
} from 'lucide-react'

import type {
  CollectionLoadState,
  MediaListEntry,
  MediaListEntryId,
} from '@/modules/media-list'

import { MediaCard } from './MediaCard'
import type { MediaEntriesProps } from './AnimatedMediaEntries'

export interface MediaListViewProps {
  entries: readonly MediaListEntry[]
  loadState: CollectionLoadState
  page?: number
  pageCount?: number
  totalEntries?: number
  viewMode?: 'grid' | 'list'
  motionReady?: boolean
  bulkMode?: boolean
  selectedIds?: ReadonlySet<MediaListEntryId>
  onToggleSelection?: (entryId: MediaListEntryId) => void
  onSelectPage?: (entryIds: readonly MediaListEntryId[]) => void
  onSelectAllFiltered?: () => void
  onPageChange?: (page: number) => void
  onEdit?: (entryId: MediaListEntryId) => void
  onDelete?: (entryId: MediaListEntryId) => void
  onFindRelated?: (entryId: MediaListEntryId) => void
  onEditSelected?: () => void
  onDeleteSelected?: () => void
  onExitBulkMode?: () => void
  onRetry?: () => void
}

const EMPTY_SELECTION: ReadonlySet<MediaListEntryId> = new Set()
let animatedEntriesPromise: Promise<
  typeof import('./AnimatedMediaEntries')
> | null = null

export function preloadMediaListMotion() {
  animatedEntriesPromise ??= import('./AnimatedMediaEntries').catch((error) => {
    animatedEntriesPromise = null
    throw error
  })
  return animatedEntriesPromise
}

const AnimatedMediaEntries = dynamic<MediaEntriesProps>(
  () => preloadMediaListMotion().then((module) => module.AnimatedMediaEntries),
  { ssr: false },
)

function StaticMediaEntries(props: MediaEntriesProps) {
  return (
    <div
      className={`grid min-w-0 grid-cols-1 gap-3 ${
        props.viewMode === 'grid' ? '2xl:grid-cols-2' : ''
      }`}
    >
      {props.entries.map((entry) => (
        <MediaCard
          key={entry.id}
          entry={entry}
          bulkMode={props.bulkMode}
          selected={props.selectedIds.has(entry.id)}
          onToggle={props.onToggleSelection}
          onEdit={props.onEdit}
          onDelete={props.onDelete}
          onFindRelated={props.onFindRelated}
        />
      ))}
    </div>
  )
}

function BusyState() {
  return (
    <div
      role="status"
      className="panel flex min-h-48 items-center justify-center gap-3 p-8 text-center text-slate-600 dark:text-slate-300"
    >
      <RefreshCw aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" />
      <span>Loading your media list…</span>
    </div>
  )
}

function IdleState() {
  return (
    <div className="panel flex min-h-48 flex-col items-center justify-center p-8 text-center">
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">
        Choose a list to get started
      </h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Select an account and media type to load its entries.
      </p>
    </div>
  )
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="panel flex min-h-48 flex-col items-center justify-center p-8 text-center">
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">
        {filtered
          ? 'No entries match these filters'
          : 'Your media list is empty'}
      </h2>
      <p className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
        {filtered
          ? 'Try widening the filters or clearing the search.'
          : 'Add something on AniList, then refresh this view.'}
      </p>
    </div>
  )
}

function ProblemState({
  loadState,
  compact,
  onRetry,
}: {
  loadState: Extract<CollectionLoadState, { status: 'error' | 'offline' }>
  compact: boolean
  onRetry?: () => void
}) {
  const offline = loadState.status === 'offline'
  return (
    <div
      role={offline ? 'status' : 'alert'}
      className={`flex items-center gap-3 rounded-2xl border p-4 ${
        compact ? '' : 'min-h-40 justify-center'
      } ${
        offline
          ? 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100'
          : 'border-red-300 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950 dark:text-red-100'
      }`}
    >
      {offline ? (
        <CloudOff aria-hidden="true" className="size-5 shrink-0" />
      ) : (
        <AlertTriangle aria-hidden="true" className="size-5 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {offline ? 'You are offline' : 'The list could not be loaded'}
        </p>
        {loadState.status === 'error' && (
          <p className="mt-0.5 text-sm">{loadState.message}</p>
        )}
      </div>
      {onRetry &&
        (offline || (loadState.status === 'error' && loadState.retryable)) && (
          <button
            type="button"
            onClick={onRetry}
            className="btn-secondary shrink-0"
          >
            Retry
          </button>
        )}
    </div>
  )
}

export function MediaListView({
  entries,
  loadState,
  page = 1,
  pageCount = 1,
  totalEntries = entries.length,
  viewMode = 'grid',
  motionReady = false,
  bulkMode = false,
  selectedIds = EMPTY_SELECTION,
  onToggleSelection,
  onSelectPage,
  onSelectAllFiltered,
  onPageChange,
  onEdit,
  onDelete,
  onFindRelated,
  onEditSelected,
  onDeleteSelected,
  onExitBulkMode,
  onRetry,
}: MediaListViewProps) {
  const hasEntries = entries.length > 0
  const mediaEntriesProps: MediaEntriesProps = {
    entries,
    viewMode,
    bulkMode,
    selectedIds,
    onToggleSelection,
    onEdit,
    onDelete,
    onFindRelated,
  }

  if (loadState.status === 'idle' && !hasEntries) return <IdleState />
  if (loadState.status === 'loading' && !hasEntries) return <BusyState />
  if (loadState.status === 'empty' && !motionReady) {
    return <EmptyState filtered={false} />
  }
  if (
    (loadState.status === 'error' || loadState.status === 'offline') &&
    !hasEntries
  ) {
    return (
      <ProblemState loadState={loadState} compact={false} onRetry={onRetry} />
    )
  }

  const showFilteredEmpty =
    !hasEntries &&
    (loadState.status === 'ready' || loadState.status === 'refreshing')
  const showCanonicalEmpty = !hasEntries && loadState.status === 'empty'
  const emptyFallback =
    showFilteredEmpty || showCanonicalEmpty ? (
      <EmptyState filtered={showFilteredEmpty} />
    ) : undefined

  return (
    <div className="min-w-0 space-y-4">
      {loadState.status === 'refreshing' && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100"
        >
          <RefreshCw aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
          Refreshing this list in the background…
        </div>
      )}
      {(loadState.status === 'error' || loadState.status === 'offline') && (
        <ProblemState loadState={loadState} compact onRetry={onRetry} />
      )}

      {bulkMode && (
        <section
          aria-label="Bulk selection actions"
          className="bulk-selection-actions sticky z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-sky-300 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-sky-800 dark:bg-slate-900/95"
        >
          <p className="mr-auto min-w-32 font-semibold" aria-live="polite">
            {selectedIds.size.toLocaleString()} selected
          </p>
          {onSelectPage && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onSelectPage(entries.map(({ id }) => id))}
            >
              Select this page
            </button>
          )}
          {onSelectAllFiltered && (
            <button
              type="button"
              aria-label={`Select all ${totalEntries.toLocaleString()} filtered entries`}
              className="btn-secondary"
              onClick={onSelectAllFiltered}
            >
              Select all {totalEntries.toLocaleString()}
            </button>
          )}
          {onEditSelected && (
            <button
              type="button"
              className="btn-primary"
              disabled={selectedIds.size === 0}
              onClick={onEditSelected}
            >
              Edit selected
            </button>
          )}
          {onDeleteSelected && (
            <button
              type="button"
              className="btn-danger"
              disabled={selectedIds.size === 0}
              onClick={onDeleteSelected}
            >
              Delete selected
            </button>
          )}
          {onExitBulkMode && (
            <button
              type="button"
              className="btn-secondary"
              onClick={onExitBulkMode}
            >
              Done
            </button>
          )}
        </section>
      )}

      {motionReady ? (
        <AnimatedMediaEntries
          {...mediaEntriesProps}
          emptyFallback={emptyFallback}
        />
      ) : showFilteredEmpty || showCanonicalEmpty ? (
        <EmptyState filtered={showFilteredEmpty} />
      ) : (
        <StaticMediaEntries {...mediaEntriesProps} />
      )}

      {pageCount > 1 && (
        <nav
          aria-label="Media list pages"
          className="flex flex-wrap items-center justify-center gap-3 py-3"
        >
          <button
            type="button"
            aria-label="Previous page"
            className="btn-secondary"
            disabled={page <= 1}
            onClick={() => onPageChange?.(Math.max(1, page - 1))}
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
            <span className="hidden sm:inline">Previous</span>
          </button>
          <p className="min-w-28 text-center text-sm font-semibold text-slate-700 dark:text-slate-200">
            Page {page.toLocaleString()} of {pageCount.toLocaleString()}
          </p>
          <button
            type="button"
            aria-label="Next page"
            className="btn-secondary"
            disabled={page >= pageCount}
            onClick={() => onPageChange?.(Math.min(pageCount, page + 1))}
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight aria-hidden="true" className="size-5" />
          </button>
        </nav>
      )}
    </div>
  )
}
