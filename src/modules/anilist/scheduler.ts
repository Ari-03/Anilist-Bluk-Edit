import {
  AniListTransportError,
  SchedulerCancelledError,
  isAbortError,
} from './errors'
import type { RateLimitHints, RateLimitStats, ScheduledResult } from './types'

export interface AdaptiveRateSchedulerOptions {
  defaultLimitPerMinute?: number
  maxReadRetries?: number
  initialRetryDelayMs?: number
  now?: () => number
  sleep?: (milliseconds: number) => Promise<void>
  random?: () => number
}

const defaultSleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

const initialStats = (limitPerMinute: number): RateLimitStats => ({
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  retriedRequests: 0,
  rateLimitHits: 0,
  averageResponseTime: 0,
  currentQueueSize: 0,
  limitPerMinute,
  remaining: null,
  resetAt: null,
})

/**
 * A conservative scheduler for AniList's shared rate limit. Mutation starts
 * are serialized and are never retried. Reads may retry known transient
 * failures because they are idempotent.
 */
export class AdaptiveRateScheduler {
  private readonly maxReadRetries: number
  private readonly initialRetryDelayMs: number
  private readonly now: () => number
  private readonly sleep: (milliseconds: number) => Promise<void>
  private readonly random: () => number
  private stats: RateLimitStats
  private blockedUntil = 0
  private nextSlotAt = 0
  private slotTail: Promise<void> = Promise.resolve()
  private mutationTail: Promise<void> = Promise.resolve()
  private responseTimeTotal = 0

  constructor(options: AdaptiveRateSchedulerOptions = {}) {
    const limit = options.defaultLimitPerMinute ?? 30
    this.maxReadRetries = options.maxReadRetries ?? 3
    this.initialRetryDelayMs = options.initialRetryDelayMs ?? 1_000
    this.now = options.now ?? Date.now
    this.sleep = options.sleep ?? defaultSleep
    this.random = options.random ?? Math.random
    this.stats = initialStats(limit)
  }

  schedule<T>(
    kind: 'read' | 'mutation',
    executor: () => Promise<ScheduledResult<T>>,
    signal?: AbortSignal,
  ): Promise<T> {
    this.stats.currentQueueSize += 1

    const run = () => this.execute(kind, executor, signal)
    const result = kind === 'mutation' ? this.enqueueMutation(run, signal) : run()

    return result.finally(() => {
      this.stats.currentQueueSize = Math.max(0, this.stats.currentQueueSize - 1)
    })
  }

  getStats(): RateLimitStats {
    return { ...this.stats }
  }

  private enqueueMutation<T>(run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(new SchedulerCancelledError())
    const queued = this.mutationTail.then(run, run)
    this.mutationTail = queued.then(
      () => undefined,
      () => undefined,
    )
    // `execute` observes cancellation before a queued mutation starts. Once
    // the executor has started, however, its result must settle so callers can
    // reconcile a confirmed or ambiguous upstream outcome.
    return queued
  }

  private async execute<T>(
    kind: 'read' | 'mutation',
    executor: () => Promise<ScheduledResult<T>>,
    signal?: AbortSignal,
  ): Promise<T> {
    let retry = 0

    for (;;) {
      this.assertNotCancelled(signal)
      await this.acquireRateSlot(signal)
      this.assertNotCancelled(signal)

      const startedAt = this.now()
      this.stats.totalRequests += 1
      try {
        const result = await executor()
        this.observe(result.rateLimit)
        this.stats.successfulRequests += 1
        this.recordResponseTime(this.now() - startedAt)
        return result.value
      } catch (error) {
        const transportError = error instanceof AniListTransportError ? error : null
        this.observe(transportError?.rateLimit)

        if (isAbortError(error) || (kind === 'read' && signal?.aborted)) {
          this.stats.failedRequests += 1
          throw new SchedulerCancelledError()
        }

        const retryable = kind === 'read' && this.isRetryableRead(error)
        if (!retryable || retry >= this.maxReadRetries) {
          this.stats.failedRequests += 1
          throw error
        }

        retry += 1
        this.stats.retriedRequests += 1
        if (transportError?.status === 429) this.stats.rateLimitHits += 1
        const delay = this.retryDelay(error, retry)
        await this.wait(delay, signal)
      }
    }
  }

  private async acquireRateSlot(signal?: AbortSignal): Promise<void> {
    const previous = this.slotTail
    let release!: () => void
    this.slotTail = new Promise<void>((resolve) => {
      release = resolve
    })

    await previous
    try {
      this.assertNotCancelled(signal)
      const now = this.now()
      const waitUntil = Math.max(this.nextSlotAt, this.blockedUntil)
      await this.wait(Math.max(0, waitUntil - now), signal)
      const interval = Math.ceil(60_000 / Math.max(1, this.stats.limitPerMinute))
      this.nextSlotAt = this.now() + interval
    } finally {
      release()
    }
  }

  private observe(hints?: RateLimitHints): void {
    if (!hints) return
    if (hints.limit !== undefined && Number.isFinite(hints.limit) && hints.limit > 0) {
      this.stats.limitPerMinute = hints.limit
    }
    if (hints.remaining !== undefined && Number.isFinite(hints.remaining)) {
      this.stats.remaining = Math.max(0, hints.remaining)
    }
    if (hints.resetAt !== undefined && Number.isFinite(hints.resetAt)) {
      this.stats.resetAt = hints.resetAt
      if (hints.remaining === 0) this.blockedUntil = Math.max(this.blockedUntil, hints.resetAt)
    }
    if (hints.retryAfterMs !== undefined && Number.isFinite(hints.retryAfterMs)) {
      this.blockedUntil = Math.max(this.blockedUntil, this.now() + hints.retryAfterMs)
    }
  }

  private isRetryableRead(error: unknown): boolean {
    if (!(error instanceof AniListTransportError)) return false
    return (
      error.status === undefined ||
      error.status === 403 ||
      error.status === 429 ||
      error.status === 502 ||
      error.status === 503 ||
      error.status === 504 ||
      error.code === 'NETWORK_ERROR' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ECONNRESET'
    )
  }

  private retryDelay(error: unknown, retry: number): number {
    if (error instanceof AniListTransportError) {
      const serverDelay = error.rateLimit?.retryAfterMs
      if (serverDelay !== undefined) return Math.max(0, serverDelay)
      const resetAt = error.rateLimit?.resetAt
      if (resetAt !== undefined) return Math.max(0, resetAt - this.now())
    }
    const exponential = this.initialRetryDelayMs * 2 ** (retry - 1)
    return Math.round(exponential * (0.75 + this.random() * 0.5))
  }

  private async wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
    this.assertNotCancelled(signal)
    if (milliseconds > 0 && signal) {
      await new Promise<void>((resolve, reject) => {
        const cancel = () => reject(new SchedulerCancelledError())
        signal.addEventListener('abort', cancel, { once: true })
        void this.sleep(milliseconds).then(
          () => {
            signal.removeEventListener('abort', cancel)
            resolve()
          },
          (error: unknown) => {
            signal.removeEventListener('abort', cancel)
            reject(error)
          },
        )
      })
    } else if (milliseconds > 0) {
      await this.sleep(milliseconds)
    }
    this.assertNotCancelled(signal)
  }

  private assertNotCancelled(signal?: AbortSignal): void {
    if (signal?.aborted) throw new SchedulerCancelledError()
  }

  private recordResponseTime(milliseconds: number): void {
    this.responseTimeTotal += Math.max(0, milliseconds)
    this.stats.averageResponseTime =
      this.responseTimeTotal / Math.max(1, this.stats.successfulRequests)
  }
}
