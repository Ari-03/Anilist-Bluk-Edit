import { describe, expect, it, vi } from 'vitest'

import {
  AdaptiveRateScheduler,
  AniListTransportError,
  SchedulerCancelledError,
} from '..'

const scheduler = (overrides: ConstructorParameters<typeof AdaptiveRateScheduler>[0] = {}) =>
  new AdaptiveRateScheduler({
    defaultLimitPerMinute: 60_000,
    maxReadRetries: 1,
    initialRetryDelayMs: 4,
    random: () => 0,
    sleep: async () => undefined,
    ...overrides,
  })

describe('AdaptiveRateScheduler coverage', () => {
  it('never enqueues a pre-aborted mutation', async () => {
    const controller = new AbortController()
    controller.abort()
    const executor = vi.fn(async () => ({ value: 'must-not-run' }))
    const rateScheduler = scheduler()

    await expect(
      rateScheduler.schedule('mutation', executor, controller.signal),
    ).rejects.toBeInstanceOf(SchedulerCancelledError)
    await Promise.resolve()

    expect(executor).not.toHaveBeenCalled()
    expect(rateScheduler.getStats()).toMatchObject({
      totalRequests: 0,
      currentQueueSize: 0,
    })
  })

  it.each([
    ['no status', new AniListTransportError('offline', { code: 'NETWORK_ERROR' })],
    ['403 outage', new AniListTransportError('upstream forbidden', { status: 403 })],
    ['502', new AniListTransportError('bad gateway', { status: 502 })],
    ['504', new AniListTransportError('timeout', { status: 504 })],
    ['timed out code', new AniListTransportError('timeout', { status: 418, code: 'ETIMEDOUT' })],
    ['reset code', new AniListTransportError('reset', { status: 418, code: 'ECONNRESET' })],
  ])('retries the supported transient read case: %s', async (_name, transient) => {
    const executor = vi
      .fn<() => Promise<{ value: string }>>()
      .mockRejectedValueOnce(transient)
      .mockResolvedValueOnce({ value: 'ok' })
    const rateScheduler = scheduler()

    await expect(rateScheduler.schedule('read', executor)).resolves.toBe('ok')
    expect(executor).toHaveBeenCalledTimes(2)
    expect(rateScheduler.getStats()).toMatchObject({
      retriedRequests: 1,
      successfulRequests: 1,
    })
  })

  it.each([
    ['plain error', new Error('plain')],
    ['client transport status', new AniListTransportError('bad request', { status: 400 })],
    ['unsupported status and code', new AniListTransportError('teapot', { status: 418 })],
  ])('does not retry a non-transient read: %s', async (_name, failure) => {
    const executor = vi.fn(async () => {
      throw failure
    })
    const rateScheduler = scheduler()

    await expect(rateScheduler.schedule('read', executor)).rejects.toBe(failure)
    expect(executor).toHaveBeenCalledTimes(1)
    expect(rateScheduler.getStats().failedRequests).toBe(1)
  })

  it('normalizes AbortError failures and an already-aborted read', async () => {
    const domAbort = scheduler()
    await expect(
      domAbort.schedule('read', async () => {
        throw new DOMException('aborted', 'AbortError')
      }),
    ).rejects.toBeInstanceOf(SchedulerCancelledError)
    expect(domAbort.getStats().failedRequests).toBe(1)

    const named = new Error('aborted')
    named.name = 'AbortError'
    await expect(
      scheduler().schedule('read', async () => {
        throw named
      }),
    ).rejects.toBeInstanceOf(SchedulerCancelledError)

    const controller = new AbortController()
    controller.abort()
    const executor = vi.fn(async () => ({ value: 'no' }))
    await expect(
      scheduler().schedule('read', executor, controller.signal),
    ).rejects.toBeInstanceOf(SchedulerCancelledError)
    expect(executor).not.toHaveBeenCalled()
  })

  it('uses server retry-after and reset delays before exponential jitter', async () => {
    const sleeps: number[] = []
    let now = 1_000
    const make = () =>
      scheduler({
        now: () => now,
        sleep: async (milliseconds) => {
          sleeps.push(milliseconds)
          now += milliseconds
        },
      })

    const retryAfter = vi
      .fn<() => Promise<{ value: string }>>()
      .mockRejectedValueOnce(
        new AniListTransportError('limited', {
          status: 429,
          rateLimit: { retryAfterMs: -5 },
        }),
      )
      .mockResolvedValueOnce({ value: 'ok' })
    const first = make()
    await expect(first.schedule('read', retryAfter)).resolves.toBe('ok')
    expect(first.getStats().rateLimitHits).toBe(1)

    const reset = vi
      .fn<() => Promise<{ value: string }>>()
      .mockRejectedValueOnce(
        new AniListTransportError('unavailable', {
          status: 503,
          rateLimit: { resetAt: 500 },
        }),
      )
      .mockResolvedValueOnce({ value: 'ok' })
    await expect(make().schedule('read', reset)).resolves.toBe('ok')

    const jitter = vi
      .fn<() => Promise<{ value: string }>>()
      .mockRejectedValueOnce(new AniListTransportError('unavailable', { status: 503 }))
      .mockResolvedValueOnce({ value: 'ok' })
    await expect(make().schedule('read', jitter)).resolves.toBe('ok')
    expect(sleeps).toContain(3)
  })

  it('sanitizes observed rate hints and records a non-blocking reset', async () => {
    let now = 100
    const sleeps: number[] = []
    const rateScheduler = scheduler({
      now: () => now,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds)
        now += milliseconds
      },
    })

    await rateScheduler.schedule('read', async () => ({
      value: 'first',
      rateLimit: {
        limit: Number.NaN,
        remaining: -2,
        resetAt: 500,
        retryAfterMs: Number.NaN,
      },
    }))
    expect(rateScheduler.getStats()).toMatchObject({
      limitPerMinute: 60_000,
      remaining: 0,
      resetAt: 500,
    })

    await rateScheduler.schedule('read', async () => ({
      value: 'second',
      rateLimit: { limit: -1, remaining: 2, resetAt: Number.NaN, retryAfterMs: 5 },
    }))
    await rateScheduler.schedule('read', async () => ({ value: 'third' }))
    expect(rateScheduler.getStats().remaining).toBe(2)
    expect(sleeps).toContain(5)
  })

  it('waits with an abort signal and removes its listener after resolving', async () => {
    let now = 0
    const controller = new AbortController()
    const sleeps: number[] = []
    const rateScheduler = scheduler({
      defaultLimitPerMinute: 60,
      now: () => now,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds)
        now += milliseconds
      },
    })

    await rateScheduler.schedule('read', async () => ({ value: 1 }))
    await expect(
      rateScheduler.schedule('read', async () => ({ value: 2 }), controller.signal),
    ).resolves.toBe(2)
    expect(sleeps).toEqual([1_000])
  })

  it('propagates a sleep failure while releasing the shared rate slot', async () => {
    let calls = 0
    const failure = new Error('clock failed')
    const rateScheduler = scheduler({
      defaultLimitPerMinute: 60,
      now: () => 0,
      sleep: async () => {
        calls += 1
        if (calls === 1) throw failure
      },
    })
    await rateScheduler.schedule('read', async () => ({ value: 'first' }))
    const controller = new AbortController()

    await expect(
      rateScheduler.schedule('read', async () => ({ value: 'second' }), controller.signal),
    ).rejects.toBe(failure)
    expect(rateScheduler.getStats().currentQueueSize).toBe(0)
  })

  it('runs the next serialized mutation after the previous mutation rejects', async () => {
    const rateScheduler = scheduler()
    const failure = new Error('first failed')
    const first = rateScheduler.schedule('mutation', async () => {
      throw failure
    })
    const second = rateScheduler.schedule('mutation', async () => ({ value: 'second' }))

    await expect(first).rejects.toBe(failure)
    await expect(second).resolves.toBe('second')
    expect(rateScheduler.getStats()).toMatchObject({
      failedRequests: 1,
      successfulRequests: 1,
      currentQueueSize: 0,
    })
  })
})
