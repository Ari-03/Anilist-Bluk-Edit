import { useId } from 'react'

import type { ListQuery, MediaType } from '@/modules/media-list'
import { MediaFormat, MediaListStatus } from '@/types/anilist'

export interface FilterOptions {
  statuses?: readonly MediaListStatus[]
  customLists: readonly string[]
  formats: readonly MediaFormat[]
  genres: readonly string[]
  countries: readonly string[]
  customListsDisabled?: boolean
  customListsMessage?: string
  customListsLastSyncedAt?: number
}

export interface FilterRailProps {
  query: ListQuery
  onChange: (query: ListQuery) => void
  options: FilterOptions
  className?: string
  searchAutoFocus?: boolean
  title?: string
  mediaType?: MediaType
  onRefreshCustomLists?: () => void
  customListsRefreshing?: boolean
}

const ALL_STATUSES: readonly MediaListStatus[] = [
  MediaListStatus.CURRENT,
  MediaListStatus.PLANNING,
  MediaListStatus.COMPLETED,
  MediaListStatus.PAUSED,
  MediaListStatus.DROPPED,
  MediaListStatus.REPEATING,
]

const STATUS_LABELS: Record<MediaListStatus, string> = {
  [MediaListStatus.CURRENT]: 'Watching',
  [MediaListStatus.PLANNING]: 'Planning',
  [MediaListStatus.COMPLETED]: 'Completed',
  [MediaListStatus.PAUSED]: 'Paused',
  [MediaListStatus.DROPPED]: 'Dropped',
  [MediaListStatus.REPEATING]: 'Repeating',
}

const FORMAT_LABELS: Record<MediaFormat, string> = {
  [MediaFormat.TV]: 'TV',
  [MediaFormat.TV_SHORT]: 'TV short',
  [MediaFormat.MOVIE]: 'Movie',
  [MediaFormat.SPECIAL]: 'Special',
  [MediaFormat.OVA]: 'OVA',
  [MediaFormat.ONA]: 'ONA',
  [MediaFormat.MUSIC]: 'Music',
  [MediaFormat.MANGA]: 'Manga',
  [MediaFormat.NOVEL]: 'Novel',
  [MediaFormat.ONE_SHOT]: 'One shot',
}

const SORT_LABELS: Record<ListQuery['sort']['field'], string> = {
  title: 'Title',
  score: 'Score',
  progress: 'Progress',
  startedAt: 'Start date',
  updatedAt: 'Last updated',
}

function toggleValue<T>(
  values: readonly T[],
  value: T,
  selected: boolean,
): readonly T[] {
  if (selected) return values.includes(value) ? values : [...values, value]
  return values.filter((candidate) => candidate !== value)
}

function parseOptionalNumber(value: string): number | undefined {
  if (value.trim() === '') return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

interface CheckGroupProps<T extends string> {
  legend: string
  name: string
  values: readonly T[]
  selected: readonly T[]
  labelFor: (value: T) => string
  onToggle: (value: T, checked: boolean) => void
  disabled?: boolean
  emptyMessage?: string
}

function CheckGroup<T extends string>({
  legend,
  name,
  values,
  selected,
  labelFor,
  onToggle,
  disabled,
  emptyMessage = 'No options available.',
}: CheckGroupProps<T>) {
  const id = useId()

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="subtle-label mb-1">{legend}</legend>
      {values.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {emptyMessage}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 lg:grid-cols-1">
          {values.map((value, index) => {
            const inputId = `${id}-${name}-${index}`
            return (
              <label
                key={`${value}-${index}`}
                htmlFor={inputId}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm text-slate-700 hover:bg-slate-100 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky-500 disabled:cursor-not-allowed dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <input
                  id={inputId}
                  name={name}
                  type="checkbox"
                  className="size-4 shrink-0 rounded border-slate-300 text-sky-500 focus:ring-sky-500 disabled:cursor-not-allowed"
                  checked={selected.includes(value)}
                  onChange={(event) =>
                    onToggle(value, event.currentTarget.checked)
                  }
                />
                <span className="min-w-0 truncate">{labelFor(value)}</span>
              </label>
            )
          })}
        </div>
      )}
    </fieldset>
  )
}

export function FilterRail({
  query,
  onChange,
  options,
  className = '',
  searchAutoFocus = false,
  title = 'Filters and sorting',
  mediaType = 'ANIME',
  onRefreshCustomLists,
  customListsRefreshing = false,
}: FilterRailProps) {
  const id = useId()
  const update = (patch: Partial<ListQuery>) =>
    onChange({ ...query, ...patch, page: 1 })

  const resetFilters = () =>
    onChange({
      ...query,
      statuses: [],
      customLists: [],
      formats: [],
      genres: [],
      countries: [],
      year: {},
      score: {},
      search: '',
      includeHidden: false,
      page: 1,
    })

  return (
    <section
      aria-label={title}
      className={`space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">
          {title}
        </h2>
        <button
          type="button"
          onClick={resetFilters}
          className="min-h-11 rounded-lg px-2 text-sm font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950"
        >
          Reset
        </button>
      </div>

      <div>
        <label
          htmlFor={`${id}-search`}
          className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200"
        >
          Search titles
        </label>
        <input
          id={`${id}-search`}
          type="search"
          autoFocus={searchAutoFocus}
          className="field"
          value={query.search}
          placeholder="Title…"
          onChange={(event) => update({ search: event.currentTarget.value })}
        />
      </div>

      <CheckGroup
        legend="Status"
        name="status"
        values={options.statuses ?? ALL_STATUSES}
        selected={query.statuses}
        labelFor={(status) => {
          if (status === MediaListStatus.CURRENT) {
            return mediaType === 'MANGA' ? 'Reading' : 'Watching'
          }
          if (status === MediaListStatus.REPEATING) {
            return mediaType === 'MANGA' ? 'Rereading' : 'Rewatching'
          }
          return STATUS_LABELS[status]
        }}
        onToggle={(status, checked) =>
          update({ statuses: toggleValue(query.statuses, status, checked) })
        }
      />

      <div className="space-y-1">
        <CheckGroup
          legend={`${mediaType === 'MANGA' ? 'Manga' : 'Anime'} custom lists`}
          name="custom-list"
          values={options.customLists}
          selected={query.customLists}
          labelFor={(name) => name}
          disabled={options.customListsDisabled}
          emptyMessage={
            options.customListsDisabled
              ? (options.customListsMessage ?? 'Custom lists are unavailable.')
              : 'No custom lists.'
          }
          onToggle={(name, checked) =>
            update({
              customLists: toggleValue(query.customLists, name, checked),
            })
          }
        />
        <div className="flex items-center justify-between gap-2">
          {options.customListsLastSyncedAt !== undefined ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Last synced{' '}
              <time
                dateTime={new Date(
                  options.customListsLastSyncedAt,
                ).toISOString()}
              >
                {new Date(options.customListsLastSyncedAt).toLocaleString()}
              </time>
            </p>
          ) : (
            <span />
          )}
          {onRefreshCustomLists && (
            <button
              type="button"
              className="min-h-11 rounded-lg px-2 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:cursor-wait disabled:opacity-60 dark:text-sky-300 dark:hover:bg-sky-950"
              disabled={customListsRefreshing}
              onClick={onRefreshCustomLists}
            >
              {customListsRefreshing ? 'Refreshing…' : 'Refresh lists'}
            </button>
          )}
        </div>
      </div>

      <CheckGroup
        legend="Format"
        name="format"
        values={options.formats}
        selected={query.formats}
        labelFor={(format) => FORMAT_LABELS[format]}
        onToggle={(format, checked) =>
          update({ formats: toggleValue(query.formats, format, checked) })
        }
      />

      <CheckGroup
        legend="Genre"
        name="genre"
        values={options.genres}
        selected={query.genres}
        labelFor={(genre) => genre}
        onToggle={(genre, checked) =>
          update({ genres: toggleValue(query.genres, genre, checked) })
        }
      />

      <CheckGroup
        legend="Country"
        name="country"
        values={options.countries}
        selected={query.countries}
        labelFor={(country) => country}
        onToggle={(country, checked) =>
          update({ countries: toggleValue(query.countries, country, checked) })
        }
      />

      <fieldset className="space-y-2">
        <legend className="subtle-label">Release year</legend>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm text-slate-700 dark:text-slate-200">
            <span className="mb-1 block">Year from</span>
            <input
              type="number"
              inputMode="numeric"
              min={1900}
              max={2200}
              className="field"
              value={query.year.min ?? ''}
              onChange={(event) =>
                update({
                  year: {
                    ...query.year,
                    min: parseOptionalNumber(event.currentTarget.value),
                  },
                })
              }
            />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            <span className="mb-1 block">Year to</span>
            <input
              type="number"
              inputMode="numeric"
              min={1900}
              max={2200}
              className="field"
              value={query.year.max ?? ''}
              onChange={(event) =>
                update({
                  year: {
                    ...query.year,
                    max: parseOptionalNumber(event.currentTarget.value),
                  },
                })
              }
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="subtle-label">Score</legend>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm text-slate-700 dark:text-slate-200">
            <span className="mb-1 block">Score from</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="any"
              className="field"
              value={query.score.min ?? ''}
              onChange={(event) =>
                update({
                  score: {
                    ...query.score,
                    min: parseOptionalNumber(event.currentTarget.value),
                  },
                })
              }
            />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            <span className="mb-1 block">Score to</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="any"
              className="field"
              value={query.score.max ?? ''}
              onChange={(event) =>
                update({
                  score: {
                    ...query.score,
                    max: parseOptionalNumber(event.currentTarget.value),
                  },
                })
              }
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="subtle-label">Sort</legend>
        <label className="block text-sm text-slate-700 dark:text-slate-200">
          <span className="mb-1 block">Sort field</span>
          <select
            className="field"
            value={query.sort.field}
            onChange={(event) =>
              update({
                sort: {
                  ...query.sort,
                  field: event.currentTarget
                    .value as ListQuery['sort']['field'],
                },
              })
            }
          >
            {Object.entries(SORT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-slate-700 dark:text-slate-200">
          <span className="mb-1 block">Sort direction</span>
          <select
            className="field"
            value={query.sort.direction}
            onChange={(event) =>
              update({
                sort: {
                  ...query.sort,
                  direction: event.currentTarget.value as 'asc' | 'desc',
                },
              })
            }
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </label>
      </fieldset>

      <label className="block text-sm text-slate-700 dark:text-slate-200">
        <span className="mb-1 block">Entries per page</span>
        <select
          className="field"
          value={query.pageSize}
          onChange={(event) =>
            update({
              pageSize: Number(event.currentTarget.value) as 50 | 100 | 250,
            })
          }
        >
          <option value={50}>50</option>
          <option value={100}>100</option>
          <option value={250}>250</option>
        </select>
      </label>

      <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
        <input
          type="checkbox"
          className="size-4 rounded border-slate-300 text-sky-500 focus:ring-sky-500"
          checked={query.includeHidden ?? false}
          onChange={(event) =>
            update({ includeHidden: event.currentTarget.checked })
          }
        />
        Include entries hidden from status lists
      </label>
    </section>
  )
}
