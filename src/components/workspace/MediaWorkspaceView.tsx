import { useRef, useState } from 'react'
import { Grid2X2, List, ListFilter, Search } from 'lucide-react'

import type {
  CollectionLoadState,
  ListProjection,
  ListQuery,
  MediaListEntryId,
  MediaType,
} from '@/modules/media-list'

import { FilterDrawer } from './FilterDrawer'
import { FilterRail, type FilterOptions } from './FilterRail'
import { MediaListView, type MediaListViewProps } from './MediaListView'

export interface MediaWorkspaceViewProps extends Omit<
  MediaListViewProps,
  | 'entries'
  | 'loadState'
  | 'page'
  | 'pageCount'
  | 'totalEntries'
  | 'onPageChange'
> {
  mediaType: MediaType
  onMediaTypeChange: (mediaType: MediaType) => void
  query: ListQuery
  onQueryChange: (query: ListQuery) => void
  filterOptions: FilterOptions
  projection: ListProjection
  loadState: CollectionLoadState
  onPageChange?: (page: number) => void
  onStartBulkMode?: () => void
  onRefreshCustomLists?: () => void
  customListsRefreshing?: boolean
  selectedIds?: ReadonlySet<MediaListEntryId>
  viewMode?: 'grid' | 'list'
  onViewModeChange?: (viewMode: 'grid' | 'list') => void
}

export function MediaWorkspaceView({
  mediaType,
  onMediaTypeChange,
  query,
  onQueryChange,
  filterOptions,
  projection,
  loadState,
  onPageChange,
  onStartBulkMode,
  onRefreshCustomLists,
  customListsRefreshing,
  viewMode = 'grid',
  onViewModeChange = () => undefined,
  ...listProps
}: MediaWorkspaceViewProps) {
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false)
  const filterButtonRef = useRef<HTMLButtonElement>(null)

  const changePage = (page: number) => {
    onQueryChange({ ...query, page })
    onPageChange?.(page)
  }

  const updateSearch = (search: string) =>
    onQueryChange({ ...query, search, page: 1 })

  return (
    <div className="min-w-0 space-y-4">
      <header className="panel flex min-w-0 flex-wrap items-center gap-2 p-2 sm:p-3">
        <div
          role="group"
          aria-label="Media type"
          className="grid min-w-0 flex-1 grid-cols-2 rounded-xl bg-slate-100 p-1 sm:flex-none dark:bg-slate-800"
        >
          <button
            type="button"
            aria-label="Show anime list"
            aria-pressed={mediaType === 'ANIME'}
            onClick={() => onMediaTypeChange('ANIME')}
            className={`min-w-24 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
              mediaType === 'ANIME'
                ? 'bg-white text-sky-700 shadow-sm dark:bg-slate-700 dark:text-sky-300'
                : 'text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'
            }`}
          >
            Anime
          </button>
          <button
            type="button"
            aria-label="Show manga list"
            aria-pressed={mediaType === 'MANGA'}
            onClick={() => onMediaTypeChange('MANGA')}
            className={`min-w-24 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
              mediaType === 'MANGA'
                ? 'bg-white text-sky-700 shadow-sm dark:bg-slate-700 dark:text-sky-300'
                : 'text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'
            }`}
          >
            Manga
          </button>
        </div>

        <label className="relative order-3 min-w-0 basis-full lg:hidden">
          <span className="sr-only">Search titles</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            aria-label="Search titles"
            value={query.search}
            onChange={(event) => updateSearch(event.currentTarget.value)}
            placeholder="Search titles…"
            className="field pl-10"
          />
        </label>

        <button
          ref={filterButtonRef}
          type="button"
          aria-label="Open filters and sorting"
          className="btn-secondary ml-auto lg:hidden"
          onClick={() => setFilterDrawerOpen(true)}
        >
          <ListFilter aria-hidden="true" className="size-5" />
          Filters & sort
        </button>

        <div role="group" aria-label="View mode" className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            className="grid min-h-11 min-w-11 place-items-center rounded-lg aria-pressed:bg-white aria-pressed:text-sky-700 aria-pressed:shadow-sm dark:aria-pressed:bg-slate-700 dark:aria-pressed:text-sky-300"
            aria-label="Grid view"
            aria-pressed={viewMode === 'grid'}
            onClick={() => onViewModeChange('grid')}
          >
            <Grid2X2 className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="grid min-h-11 min-w-11 place-items-center rounded-lg aria-pressed:bg-white aria-pressed:text-sky-700 aria-pressed:shadow-sm dark:aria-pressed:bg-slate-700 dark:aria-pressed:text-sky-300"
            aria-label="List view"
            aria-pressed={viewMode === 'list'}
            onClick={() => onViewModeChange('list')}
          >
            <List className="size-4" aria-hidden="true" />
          </button>
        </div>

        {onStartBulkMode && !listProps.bulkMode && (
          <button
            type="button"
            className="btn-primary"
            onClick={onStartBulkMode}
          >
            Bulk edit
          </button>
        )}
      </header>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="hidden lg:block" aria-label="List filters">
          <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto pr-1">
            <FilterRail
              query={query}
              onChange={onQueryChange}
              options={filterOptions}
              mediaType={mediaType}
              onRefreshCustomLists={onRefreshCustomLists}
              customListsRefreshing={customListsRefreshing}
            />
          </div>
        </aside>

        <section className="min-w-0" aria-label="Media list results">
          <MediaListView
            {...listProps}
            entries={projection.entries}
            loadState={loadState}
            page={projection.page}
            pageCount={projection.pageCount}
            totalEntries={projection.totalEntries}
            viewMode={viewMode}
            onPageChange={changePage}
          />
        </section>
      </div>

      <FilterDrawer
        open={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        query={query}
        onChange={onQueryChange}
        options={filterOptions}
        mediaType={mediaType}
        onRefreshCustomLists={onRefreshCustomLists}
        customListsRefreshing={customListsRefreshing}
        returnFocusRef={filterButtonRef}
      />
    </div>
  )
}
