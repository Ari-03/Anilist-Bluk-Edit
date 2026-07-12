import { describe, expect, it, vi } from 'vitest'

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))

import { track } from '@vercel/analytics'
import {
  redactAnalyticsUrl,
  retryCountSince,
  trackBulkJobOutcome,
} from './privacy-analytics'

describe('privacy analytics', () => {
  it('allowlists routes and removes query strings and fragments', () => {
    expect(
      redactAnalyticsUrl({
        type: 'pageview',
        url: 'https://example.test/?account=4#access_token=secret',
      }),
    ).toEqual({ type: 'pageview', url: 'https://example.test/' })

    expect(
      redactAnalyticsUrl({
        type: 'pageview',
        url: 'https://example.test/12345/private-title/access_token_secret',
      }),
    ).toEqual({ type: 'pageview', url: 'https://example.test/404' })

    expect(
      redactAnalyticsUrl({ type: 'pageview', url: 'not a valid url%' }),
    ).toEqual({ type: 'pageview', url: '/404' })
  })

  it('sends only coarse allowlisted bulk-job properties', async () => {
    await trackBulkJobOutcome({
      outcome: 'partial',
      durationMs: 7_000,
      selectedCount: 37,
      retryCount: 1,
      errorCategory: 'network',
    })

    expect(track).toHaveBeenCalledWith('bulk_job_terminal', {
      outcome: 'partial',
      duration_bucket: '5-30s',
      selected_count_bucket: '11-50',
      retry_count_bucket: '1',
      error_category: 'network',
    })
  })

  it('keeps a zero retry count distinct from one retry', async () => {
    await trackBulkJobOutcome({
      outcome: 'completed',
      durationMs: 1_000,
      selectedCount: 1,
      retryCount: 0,
    })

    expect(track).toHaveBeenLastCalledWith('bulk_job_terminal', {
      outcome: 'completed',
      duration_bucket: '<5s',
      selected_count_bucket: '1',
      retry_count_bucket: '0',
      error_category: 'none',
    })
  })

  it('derives a job-local retry count from cumulative scheduler stats', () => {
    expect(retryCountSince(8, 5)).toBe(3)
    expect(retryCountSince(4, 5)).toBe(0)
  })
})
