import { describe, expect, it, vi } from 'vitest'

import {
  AdaptiveRateScheduler,
  AniListTransportError,
  SchedulerCancelledError,
} from '..'

const fastScheduler = () =>
  new AdaptiveRateScheduler({
    defaultLimitPerMinute: 60_000,
    maxReadRetries: 2,
    random: () => 0,
    sleep: async () => undefined,
  })

describe('AdaptiveRateScheduler', () => {
  it('retries retryable reads but never retries mutations', async () => {
    const scheduler = fastScheduler()
    const read = vi
      .fn<() => Promise<{ value: string }>>()
      .mockRejectedValueOnce(new AniListTransportError('unavailable', { status: 503 }))
      .mockResolvedValue({ value: 'ok' })

    await expect(scheduler.schedule('read', read)).resolves.toBe('ok')
    expect(read).toHaveBeenCalledTimes(2)

    const mutation = vi
      .fn<() => Promise<{ value: string }>>()
      .mockRejectedValue(new AniListTransportError('connection lost', { ambiguous: true }))

    await expect(scheduler.schedule('mutation', mutation)).rejects.toMatchObject({
      ambiguous: true,
    })
    expect(mutation).toHaveBeenCalledTimes(1)
  })

  it('serializes mutations and settles a cancelled queued request', async () => {
    const scheduler = fastScheduler()
    let settleFirst!: () => void
    let markFirstStarted!: () => void
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve
    })
    const first = scheduler.schedule('mutation', async () => {
      markFirstStarted()
      await new Promise<void>((resolve) => {
        settleFirst = resolve
      })
      return { value: 'first' }
    })

    await firstStarted

    const controller = new AbortController()
    const secondExecutor = vi.fn(async () => ({ value: 'second' }))
    const second = scheduler.schedule('mutation', secondExecutor, controller.signal)
    controller.abort()

    settleFirst()
    await expect(first).resolves.toBe('first')
    await expect(second).rejects.toBeInstanceOf(SchedulerCancelledError)
    expect(secondExecutor).not.toHaveBeenCalled()
  })

  it('lets an active mutation settle after cancellation', async () => {
    const scheduler = fastScheduler()
    const controller = new AbortController()
    let settleMutation!: () => void
    let markStarted!: () => void
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const mutation = scheduler.schedule(
      'mutation',
      async () => {
        markStarted()
        await new Promise<void>((resolve) => {
          settleMutation = resolve
        })
        return { value: 'confirmed' }
      },
      controller.signal,
    )

    await started
    controller.abort()
    settleMutation()

    await expect(mutation).resolves.toBe('confirmed')
  })

  it('preserves an active mutation transport failure after cancellation', async () => {
    const scheduler = fastScheduler()
    const controller = new AbortController()
    const failure = new AniListTransportError('connection lost', {
      ambiguous: true,
    })
    let release!: () => void
    let markStarted!: () => void
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const mutation = scheduler.schedule(
      'mutation',
      async () => {
        markStarted()
        await new Promise<void>((resolve) => {
          release = resolve
        })
        throw failure
      },
      controller.signal,
    )

    await started
    controller.abort()
    release()

    await expect(mutation).rejects.toBe(failure)
  })

  it('adapts its rate and retry delay from response headers', async () => {
    const sleeps: number[] = []
    let now = 0
    const scheduler = new AdaptiveRateScheduler({
      now: () => now,
      random: () => 0,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds)
        now += milliseconds
      },
    })

    await scheduler.schedule('read', async () => ({
      value: 'first',
      rateLimit: { limit: 90, remaining: 0, resetAt: 3_000 },
    }))
    await scheduler.schedule('read', async () => ({ value: 'second' }))

    expect(scheduler.getStats().limitPerMinute).toBe(90)
    expect(sleeps.some((delay) => delay >= 3_000)).toBe(true)
  })
})
