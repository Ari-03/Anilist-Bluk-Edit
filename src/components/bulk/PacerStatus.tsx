import { useEffect, useState, useSyncExternalStore } from 'react'
import { pacer } from '@/lib/pacer'
import { cn } from '@/lib/utils'

/**
 * Shown during a bulk run only while the shared pacer is backing off from
 * AniList's rate limit, with a countdown; renders nothing otherwise.
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

    if (!paused || !snapshot.penalizedUntil) return null
    const secondsLeft = Math.ceil((snapshot.penalizedUntil - now) / 1000)

    return (
        <p className={cn('text-[11px] text-warning tabular-nums', className)}>
            Waiting for AniList&apos;s rate limit · {secondsLeft}s
        </p>
    )
}
