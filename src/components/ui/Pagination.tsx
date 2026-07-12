'use client'

import { useId } from 'react'

export type PageSize = 50 | 100 | 250

export interface PaginationProps {
  page: number
  totalEntries: number
  pageSize: PageSize
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: PageSize) => void
  ariaLabel?: string
  className?: string
}

export const pageSizeOptions: readonly PageSize[] = [50, 100, 250]

function normalizeCount(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

function isPageSize(value: number): value is PageSize {
  return value === 50 || value === 100 || value === 250
}

export function Pagination({
  page,
  totalEntries,
  pageSize,
  onPageChange,
  onPageSizeChange,
  ariaLabel = 'List pagination',
  className = '',
}: PaginationProps) {
  const pageSizeId = useId()
  const safeTotal = normalizeCount(totalEntries)
  const pageCount = Math.max(1, Math.ceil(safeTotal / pageSize))
  const safePage = Math.min(pageCount, Math.max(1, normalizeCount(page)))
  const firstEntry = safeTotal === 0 ? 0 : (safePage - 1) * pageSize + 1
  const lastEntry = Math.min(safePage * pageSize, safeTotal)
  const range =
    safeTotal === 0
      ? '0 of 0 entries'
      : `${firstEntry.toLocaleString()}–${lastEntry.toLocaleString()} of ${safeTotal.toLocaleString()} entries`

  return (
    <nav
      aria-label={ariaLabel}
      className={`flex flex-wrap items-center justify-between gap-3 text-sm text-gray-700 dark:text-gray-200 ${className}`}
    >
      <p aria-live="polite" className="min-w-fit tabular-nums">
        {range}
      </p>

      <div className="flex items-center gap-1" aria-label="Page navigation">
        <button
          type="button"
          aria-label="Previous page"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700 dark:focus-visible:ring-offset-gray-900"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none">
            <path
              d="M12.5 4.5L7 10l5.5 5.5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.75"
            />
          </svg>
        </button>
        <span aria-live="polite" className="min-w-24 px-2 text-center tabular-nums">
          Page {safePage} of {pageCount}
        </span>
        <button
          type="button"
          aria-label="Next page"
          disabled={safePage >= pageCount}
          onClick={() => onPageChange(safePage + 1)}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700 dark:focus-visible:ring-offset-gray-900"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none">
            <path
              d="M7.5 4.5L13 10l-5.5 5.5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.75"
            />
          </svg>
        </button>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor={pageSizeId} className="font-medium">
          Entries per page
        </label>
        <select
          id={pageSizeId}
          value={pageSize}
          onChange={(event) => {
            const nextSize = Number(event.currentTarget.value)
            if (isPageSize(nextSize)) onPageSizeChange(nextSize)
          }}
          className="min-h-11 rounded-lg border border-gray-300 bg-white px-3 text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:focus-visible:ring-offset-gray-900"
        >
          {pageSizeOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    </nav>
  )
}
