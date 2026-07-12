'use client'

import { useId } from 'react'

export interface ProgressBarProps {
  label: string
  value: number
  max?: number
  valueText?: string
  showValue?: boolean
  className?: string
}

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback
}

export function ProgressBar({
  label,
  value,
  max = 100,
  valueText,
  showValue = true,
  className = '',
}: ProgressBarProps) {
  const labelId = useId()
  const safeMax = Math.max(1, finiteOr(max, 100))
  const safeValue = Math.min(safeMax, Math.max(0, finiteOr(value, 0)))
  const displayValue = valueText ?? `${safeValue} of ${safeMax}`
  const percentage = (safeValue / safeMax) * 100

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
        <span id={labelId} className="font-medium text-gray-800 dark:text-gray-100">
          {label}
        </span>
        {showValue ? (
          <span className="text-gray-600 dark:text-gray-300">{displayValue}</span>
        ) : null}
      </div>
      <div
        role="progressbar"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={safeValue}
        aria-valuetext={valueText}
        className="h-2.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
      >
        <div
          className="h-full rounded-full bg-blue-600 transition-[width] duration-150 motion-reduce:transition-none dark:bg-blue-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
