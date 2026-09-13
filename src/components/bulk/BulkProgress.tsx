import ProgressBar from '@/components/ui/ProgressBar'
import PacerStatus from '@/components/bulk/PacerStatus'
import { BulkProgress as BulkProgressState } from '@/hooks/useBulkOperations'
import { Loader2, Trash2 } from 'lucide-react'

interface BulkProgressProps {
    operation: 'update' | 'delete'
    progress: BulkProgressState
    isCancelling: boolean
    onCancel: () => void
}

export default function BulkProgress({ operation, progress, isCancelling, onCancel }: BulkProgressProps) {
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
                </span>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-fg-muted tabular-nums">{pct}%</span>
                    <button
                        onClick={onCancel}
                        disabled={isCancelling}
                        className="btn-ghost h-8 px-2.5 text-xs"
                    >
                        {isCancelling ? 'Stopping…' : 'Stop'}
                    </button>
                </div>
            </div>
            <ProgressBar
                value={progress.current}
                max={progress.total}
                barClassName={isDelete ? 'bg-danger' : undefined}
            />
            <div className="flex items-center justify-between gap-4 text-[11px] text-fg-subtle tabular-nums">
                <span className="flex items-center gap-4">
                    <span className="text-success">{progress.successful} ok</span>
                    {progress.failed > 0 && <span className="text-danger">{progress.failed} failed</span>}
                </span>
                <PacerStatus />
            </div>
        </div>
    )
}
