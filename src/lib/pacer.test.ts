import { describe, expect, test } from 'bun:test'
import { Pacer, sleepUntil } from './pacer'

// Mirrors RequestPacerTests.swift from the iOS app
const t0 = 1_000_000_000

describe('Pacer', () => {
    test('burst is immediate', () => {
        const pacer = new Pacer(30, 5)
        for (let i = 0; i < 5; i++) expect(pacer.reserve(t0)).toBe(t0)
    })

    test('sustained requests converge to the refill rate', () => {
        const pacer = new Pacer(30, 5)
        for (let i = 0; i < 5; i++) pacer.reserve(t0)
        // 30/min = one token every 2 s
        expect(pacer.reserve(t0) - t0).toBeCloseTo(2000, 0)
        expect(pacer.reserve(t0) - t0).toBeCloseTo(4000, 0)
    })

    test('tokens refill over time', () => {
        const pacer = new Pacer(30, 5)
        for (let i = 0; i < 5; i++) pacer.reserve(t0)
        // 10 s later, 5 tokens have refilled (capped at capacity): burst again
        const later = t0 + 10_000
        expect(pacer.reserve(later)).toBe(later)
        expect(pacer.reserve(later)).toBe(later)
    })

    test('penalize pushes all subsequent slots', () => {
        const pacer = new Pacer(30, 5)
        const horizon = t0 + 100_000
        pacer.reserve(t0)
        pacer.penalize(horizon)
        expect(pacer.reserve(t0)).toBeGreaterThanOrEqual(horizon)
    })

    test('penalize in the past is ignored', () => {
        const pacer = new Pacer(30, 5)
        pacer.reserve(t0)
        pacer.penalize(t0 - 100_000)
        expect(pacer.reserve(t0)).toBe(t0)
    })

    test('low remaining header triggers a penalty until reset', () => {
        const pacer = new Pacer(30, 5)
        pacer.reserve(t0)
        const resetSeconds = (t0 + 30_000) / 1000
        pacer.observe(200, new Headers({ 'x-ratelimit-remaining': '1', 'x-ratelimit-reset': String(resetSeconds) }), t0)
        expect(pacer.reserve(t0)).toBeGreaterThanOrEqual(t0 + 30_000)
        expect(pacer.getSnapshot().penalizedUntil).not.toBeNull()
    })

    test('healthy remaining header does not penalize', () => {
        const pacer = new Pacer(30, 5)
        pacer.observe(200, new Headers({ 'x-ratelimit-remaining': '25', 'x-ratelimit-reset': String((t0 + 30_000) / 1000) }), t0)
        expect(pacer.reserve(t0)).toBe(t0)
        expect(pacer.getSnapshot().remaining).toBe(25)
    })

    test('429 with Retry-After holds sends for that long', () => {
        const pacer = new Pacer(30, 5)
        pacer.reserve(t0)
        pacer.observe(429, new Headers({ 'retry-after': '45' }), t0)
        expect(pacer.reserve(t0)).toBeGreaterThanOrEqual(t0 + 45_000)
    })

    test('429 without Retry-After assumes a full minute', () => {
        const pacer = new Pacer(30, 5)
        pacer.reserve(t0)
        pacer.observe(429, new Headers(), t0)
        expect(pacer.reserve(t0)).toBeGreaterThanOrEqual(t0 + 60_000)
    })

    test('snapshot notifies subscribers and is referentially stable between changes', () => {
        const pacer = new Pacer(30, 5)
        let calls = 0
        const unsubscribe = pacer.subscribe(() => calls++)
        const before = pacer.getSnapshot()
        expect(pacer.getSnapshot()).toBe(before)
        pacer.reserve(t0)
        expect(calls).toBe(1)
        expect(pacer.getSnapshot()).not.toBe(before)
        unsubscribe()
        pacer.reserve(t0)
        expect(calls).toBe(1)
    })
})

describe('sleepUntil', () => {
    test('resolves immediately for a past timestamp', async () => {
        await expect(sleepUntil(Date.now() - 1)).resolves.toBeUndefined()
    })

    test('rejects with AbortError when the signal fires mid-wait', async () => {
        const controller = new AbortController()
        const sleeping = sleepUntil(Date.now() + 10_000, controller.signal)
        controller.abort()
        await expect(sleeping).rejects.toMatchObject({ name: 'AbortError' })
    })

    test('rejects immediately when already aborted', async () => {
        const controller = new AbortController()
        controller.abort()
        await expect(sleepUntil(Date.now() - 1, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    })
})
