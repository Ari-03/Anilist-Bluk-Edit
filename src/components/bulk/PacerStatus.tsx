import { useEffect, useState, useSyncExternalStore } from 'react'
import { pacer } from '@/lib/pacer'
import { cn } from '@/lib/utils'

/**
 * Read-only line showing the shared request pacer: AniList's per-minute
 * budget, what's left in the current window, and any back-off in progress.
 */
export default function PacerStatus({ className }: { className?: string }) {
    const snapshot = useSyncExternalStore(pacer.subscribe, pacer.getSnapshot, pacer.getSnapshot)
    const [now, setNow] = useState(() => Date.now())
    const paused = snapshot.penalizedUntil !== null && snapshot.penalizedUntil > now

    // Tick only while a back-off countdown is showing
    useEffect(() => {
        if (!paused) return
        const timer = setInterval(() => setNow(Date.now()), 500)
        return () => clearInterval(timer)
    }, [paused])

    const limit = snapshot.advertisedLimit ?? snapshot.perMinute
    const secondsLeft = paused && snapshot.penalizedUntil ? Math.ceil((snapshot.penalizedUntil - now) / 1000) : 0

    return (
        <p className={cn('text-[11px] text-fg-subtle tabular-nums', className)}>
            AniList allows {limit} requests/min
            {snapshot.remaining !== null && ` · ${snapshot.remaining} left this minute`}
            {paused && <span className="text-warning"> · backing off {secondsLeft}s</span>}
        </p>
    )
}
