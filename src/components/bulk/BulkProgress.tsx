import ProgressBar from '@/components/ui/ProgressBar'
import { BulkProgress as BulkProgressState } from '@/hooks/useBulkOperations'
import { RateLimiterStats } from '@/lib/rateLimiter'
import { Loader2, Trash2 } from 'lucide-react'

interface BulkProgressProps {
    operation: 'update' | 'delete'
    progress: BulkProgressState
    stats: RateLimiterStats | null
    isCancelling: boolean
    onCancel: () => void
}

export default function BulkProgress({ operation, progress, stats, isCancelling, onCancel }: BulkProgressProps) {
    const isDelete = operation === 'delete'
    const pct = progress.total > 0 ? Math.min(100, Math.round((progress.current / progress.total) * 100)) : 0

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm font-medium text-fg tabular-nums">
                    {isDelete ? (
                        <Trash2 className="w-4 h-4 text-danger" />
                    ) : (
                        <Loader2 className="w-4 h-4 text-accent animate-spin" />
                    )}
                    {isDelete ? 'Deleting' : 'Updating'} {progress.current}/{progress.total}
                    {stats && stats.currentQueueSize > 0 && (
                        <span className="text-xs text-fg-subtle">· queue {stats.currentQueueSize}</span>
                    )}
                </span>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-fg-muted tabular-nums">{pct}%</span>
                    <button
                        onClick={onCancel}
                        disabled={isCancelling}
                        className="btn-ghost h-8 px-2.5 text-xs"
                    >
                        {isCancelling ? 'Cancelling…' : 'Cancel'}
                    </button>
                </div>
            </div>
            <ProgressBar
                value={progress.current}
                max={progress.total}
                barClassName={isDelete ? 'bg-danger' : undefined}
            />
            <div className="flex items-center gap-4 text-[11px] text-fg-subtle tabular-nums">
                <span className="text-success">{progress.successful} ok</span>
                {progress.failed > 0 && <span className="text-danger">{progress.failed} failed</span>}
                {stats && stats.rateLimitHits > 0 && <span>{stats.rateLimitHits} rate-limit hits</span>}
                {stats && stats.retriedRequests > 0 && <span>{stats.retriedRequests} retries</span>}
            </div>
        </div>
    )
}
