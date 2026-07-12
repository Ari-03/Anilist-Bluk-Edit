import { forwardRef, memo, useState, type KeyboardEvent } from 'react'
import Image from 'next/image'
import { GitBranch, Pencil, Trash2 } from 'lucide-react'

import type { MediaListEntry, MediaListEntryId } from '@/modules/media-list'

export interface MediaCardProps {
  entry: MediaListEntry
  bulkMode?: boolean
  selected?: boolean
  onToggle?: (entryId: MediaListEntryId) => void
  onEdit?: (entryId: MediaListEntryId) => void
  onDelete?: (entryId: MediaListEntryId) => void
  onFindRelated?: (entryId: MediaListEntryId) => void
}

const FALLBACK_COLORS = [
  '#0369a1',
  '#0f766e',
  '#7c3aed',
  '#be123c',
  '#b45309',
  '#4338ca',
] as const

function titleOf(entry: MediaListEntry): string {
  const title = entry.media?.title
  return (
    title?.userPreferred ??
    title?.english ??
    title?.romaji ??
    title?.native ??
    'Untitled media'
  )
}

function initialsFor(title: string): string {
  const initials = title
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toLocaleUpperCase())
    .join('')

  return initials || '?'
}

function humanize(value: string | undefined): string | undefined {
  if (!value) return undefined
  return value
    .toLocaleLowerCase()
    .split('_')
    .map((part) => `${part[0]?.toLocaleUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ')
}

function Cover({ entry, title }: { entry: MediaListEntry; title: string }) {
  const [failed, setFailed] = useState(false)
  const source =
    entry.media?.coverImage?.large ?? entry.media?.coverImage?.medium
  const color =
    entry.media?.coverImage?.color ??
    FALLBACK_COLORS[Math.abs(entry.mediaId) % FALLBACK_COLORS.length]

  return (
    <div
      aria-hidden="true"
      className="relative aspect-[2/3] w-20 shrink-0 overflow-hidden rounded-xl bg-slate-200 sm:w-24 dark:bg-slate-800"
    >
      {source && !failed ? (
        <Image
          src={source}
          alt=""
          fill
          unoptimized
          sizes="(min-width: 640px) 96px, 80px"
          className="object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          className="flex size-full items-center justify-center px-2 text-center text-2xl font-black tracking-wide text-white"
          style={{ backgroundColor: color }}
        >
          {initialsFor(title)}
        </span>
      )}
    </div>
  )
}

const MediaCardComponent = forwardRef<HTMLElement, MediaCardProps>(
  function MediaCardComponent(
    {
      entry,
      bulkMode = false,
      selected = false,
      onToggle,
      onEdit,
      onDelete,
      onFindRelated,
    },
    forwardedRef,
  ) {
    const title = titleOf(entry)
    const status = humanize(entry.status)
    const format = humanize(entry.media?.format)
    const maximum = entry.media?.episodes ?? entry.media?.chapters
    const progress = entry.progress ?? 0
    const selectionLabel = `${selected ? 'Deselect' : 'Select'} ${title}`

    const toggle = () => onToggle?.(entry.id)
    const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
      if (!bulkMode || (event.key !== 'Enter' && event.key !== ' ')) return
      event.preventDefault()
      toggle()
    }

    return (
      <article
        ref={forwardedRef}
        role={bulkMode ? 'checkbox' : undefined}
        aria-checked={bulkMode ? selected : undefined}
        aria-label={bulkMode ? selectionLabel : undefined}
        tabIndex={bulkMode ? 0 : undefined}
        onKeyDown={handleKeyDown}
        onClick={bulkMode ? toggle : undefined}
        className={`relative flex min-w-0 gap-3 rounded-2xl border bg-white p-3 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 sm:gap-4 sm:p-4 dark:bg-slate-900 dark:focus-visible:ring-offset-slate-950 ${
          bulkMode ? 'cursor-pointer select-none' : ''
        } ${
          selected
            ? 'border-sky-500 ring-2 ring-sky-500/30 dark:border-sky-400'
            : 'border-slate-200 dark:border-slate-800'
        }`}
      >
        {bulkMode && (
          <span
            aria-hidden="true"
            className={`absolute right-3 top-3 flex size-6 items-center justify-center rounded-md border-2 text-sm font-black ${
              selected
                ? 'border-sky-500 bg-sky-500 text-white'
                : 'border-slate-400 bg-white text-transparent dark:bg-slate-900'
            }`}
          >
            ✓
          </span>
        )}

        <Cover entry={entry} title={title} />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-w-0 pr-7">
            <h3 className="line-clamp-2 font-bold leading-snug text-slate-950 dark:text-white">
              {title}
            </h3>
            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs font-medium text-slate-500 dark:text-slate-400">
              {format && <span>{format}</span>}
              {status && <span>{status}</span>}
              {entry.media?.startDate?.year && (
                <span>{entry.media.startDate.year}</span>
              )}
            </div>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:max-w-sm">
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">
                Progress
              </dt>
              <dd className="font-semibold text-slate-800 dark:text-slate-100">
                {progress}
                {maximum !== undefined ? ` / ${maximum}` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">
                Score
              </dt>
              <dd className="font-semibold text-slate-800 dark:text-slate-100">
                {entry.score ?? '—'}
              </dd>
            </div>
          </dl>

          {!bulkMode && (onEdit || onDelete || onFindRelated) && (
            <div className="mt-auto flex flex-wrap justify-end gap-1 pt-3">
              {onFindRelated && (
                <button
                  type="button"
                  aria-label={`Find related seasons for ${title}`}
                  onClick={() => onFindRelated(entry.id)}
                  className="inline-flex size-11 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 hover:text-sky-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-sky-300"
                >
                  <GitBranch aria-hidden="true" className="size-5" />
                </button>
              )}
              {onEdit && (
                <button
                  type="button"
                  aria-label={`Edit ${title}`}
                  onClick={() => onEdit(entry.id)}
                  className="inline-flex size-11 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 hover:text-sky-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-sky-300"
                >
                  <Pencil aria-hidden="true" className="size-5" />
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  aria-label={`Delete ${title}`}
                  onClick={() => onDelete(entry.id)}
                  className="inline-flex size-11 items-center justify-center rounded-xl text-slate-600 hover:bg-red-50 hover:text-red-700 dark:text-slate-300 dark:hover:bg-red-950 dark:hover:text-red-300"
                >
                  <Trash2 aria-hidden="true" className="size-5" />
                </button>
              )}
            </div>
          )}
        </div>
      </article>
    )
  },
)

export const MediaCard = memo(MediaCardComponent)
