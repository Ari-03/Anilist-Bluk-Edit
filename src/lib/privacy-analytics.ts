import type { BeforeSend } from '@vercel/analytics/next'

export const redactAnalyticsUrl: BeforeSend = (event) => {
  try {
    const url = new URL(event.url, 'https://local.invalid')
    const pathname =
      url.pathname === '/'
        ? '/'
        : url.pathname === '/auth/callback'
          ? '/auth/callback'
          : '/404'
    const redacted = url.origin === 'https://local.invalid'
      ? pathname
      : `${url.origin}${pathname}`
    return { ...event, url: redacted }
  } catch {
    return { ...event, url: '/404' }
  }
}

type Outcome = 'completed' | 'partial' | 'cancelled' | 'failed' | 'unknown'
type ErrorCategory =
  | 'none'
  | 'validation'
  | 'authentication'
  | 'rate-limit'
  | 'network'
  | 'cancelled'
  | 'unknown'

const countBucket = (count: number): string => {
  if (count <= 0) return '0'
  if (count <= 1) return '1'
  if (count <= 10) return '2-10'
  if (count <= 50) return '11-50'
  if (count <= 100) return '51-100'
  return '101+'
}

const durationBucket = (milliseconds: number): string => {
  if (milliseconds < 5_000) return '<5s'
  if (milliseconds < 30_000) return '5-30s'
  if (milliseconds < 120_000) return '30-120s'
  return '120s+'
}

/** Convert the scheduler's app-lifetime counter into a per-operation value. */
export const retryCountSince = (current: number, baseline: number): number =>
  Math.max(0, Math.trunc(current) - Math.max(0, Math.trunc(baseline)))

export async function trackBulkJobOutcome(input: {
  outcome: Outcome
  durationMs: number
  selectedCount: number
  retryCount: number
  errorCategory?: ErrorCategory
}): Promise<void> {
  try {
    const { track } = await import('@vercel/analytics')
    track('bulk_job_terminal', {
      outcome: input.outcome,
      duration_bucket: durationBucket(input.durationMs),
      selected_count_bucket: countBucket(input.selectedCount),
      retry_count_bucket: countBucket(input.retryCount),
      error_category: input.errorCategory ?? 'none',
    })
  } catch {
    // Telemetry must never affect a completed user operation.
  }
}
