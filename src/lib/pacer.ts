/**
 * Token-bucket pacer shared by every AniList request in the tab.
 *
 * AniList's documented limit is 90 req/min but it has been degraded to 30 for
 * a long time, so we pace at 30 and use response headers only to slow down,
 * never to speed up. A small burst keeps single edits instant while bulk
 * loops converge to one request every ~2 s.
 */

export interface PacerSnapshot {
    /** Requests per minute we pace ourselves to */
    perMinute: number
    /** Limit AniList last advertised in X-RateLimit-Limit, if any */
    advertisedLimit: number | null
    /** X-RateLimit-Remaining from the last response, if any */
    remaining: number | null
    /** Epoch ms until which all sends are held back (429 / near-exhausted window), or null */
    penalizedUntil: number | null
}

export class Pacer {
    private tokens: number
    /** Last refill time; when pushed into the future it doubles as the penalty horizon */
    private anchor = 0
    private lastNow = 0
    private penaltyUntil = 0
    private advertisedLimit: number | null = null
    private remaining: number | null = null
    private listeners = new Set<() => void>()
    private snapshot: PacerSnapshot

    constructor(readonly perMinute = 30, readonly burst = 3) {
        this.tokens = burst
        this.snapshot = this.buildSnapshot()
    }

    private get refillPerMs() {
        return this.perMinute / 60_000
    }

    /**
     * Reserve the next send slot and return the epoch ms the caller must wait
     * until. Synchronous on purpose: reserving before any await keeps slots
     * race-free between concurrent callers.
     */
    reserve(now = Date.now()): number {
        this.lastNow = Math.max(this.lastNow, now)
        const base = Math.max(now, this.anchor)
        this.tokens = Math.min(this.burst, this.tokens + (base - this.anchor) * this.refillPerMs)

        let slot: number
        if (this.tokens >= 1) {
            this.tokens -= 1
            this.anchor = base
            slot = base
        } else {
            const wait = (1 - this.tokens) / this.refillPerMs
            this.tokens = 0
            this.anchor = base + wait
            slot = this.anchor
        }
        this.emit()
        return slot
    }

    /** Push every future slot past `until` (429 Retry-After, or the window is nearly exhausted). */
    penalize(until: number) {
        if (until <= Math.max(this.penaltyUntil, this.lastNow)) return
        this.penaltyUntil = until
        this.anchor = Math.max(this.anchor, until)
        this.tokens = 0
        this.emit()
    }

    /** Feed a response's status and rate-limit headers. Only ever slows us down. */
    observe(status: number, headers: Headers, now = Date.now()) {
        const limit = Number(headers.get('x-ratelimit-limit'))
        if (Number.isFinite(limit) && limit > 0) this.advertisedLimit = limit

        const remaining = Number(headers.get('x-ratelimit-remaining'))
        if (headers.has('x-ratelimit-remaining') && Number.isFinite(remaining)) this.remaining = remaining

        if (status === 429) {
            const retryAfter = Number(headers.get('retry-after'))
            const seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60
            this.penalize(now + seconds * 1000 + 1000)
            return
        }

        const reset = Number(headers.get('x-ratelimit-reset'))
        if (this.remaining !== null && this.remaining <= 2 && Number.isFinite(reset) && reset > 0) {
            this.penalize(reset * 1000 + 1000)
        }
        this.emit()
    }

    // --- observation (for the UI readout) ---

    subscribe = (listener: () => void) => {
        this.listeners.add(listener)
        return () => {
            this.listeners.delete(listener)
        }
    }

    getSnapshot = () => this.snapshot

    private buildSnapshot(): PacerSnapshot {
        return {
            perMinute: this.perMinute,
            advertisedLimit: this.advertisedLimit,
            remaining: this.remaining,
            penalizedUntil: this.penaltyUntil > this.lastNow ? this.penaltyUntil : null,
        }
    }

    private emit() {
        this.snapshot = this.buildSnapshot()
        this.listeners.forEach(listener => listener())
    }
}

/** The one pacer every AniListClient in this tab shares. */
export const pacer = new Pacer()

const abortError = () => new DOMException('The operation was aborted', 'AbortError')

export const isAbortError = (error: unknown): boolean =>
    error instanceof DOMException && error.name === 'AbortError'

/** Sleep until an epoch-ms timestamp; rejects immediately with AbortError if the signal fires. */
export function sleepUntil(at: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(abortError())
    const ms = at - Date.now()
    if (ms <= 0) return Promise.resolve()

    return new Promise((resolve, reject) => {
        const onAbort = () => {
            clearTimeout(timer)
            reject(abortError())
        }
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort)
            resolve()
        }, ms)
        signal?.addEventListener('abort', onAbort, { once: true })
    })
}
