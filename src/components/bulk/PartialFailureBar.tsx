import { AlertTriangle, RotateCcw, X } from 'lucide-react'

interface PartialFailureBarProps {
    failedCount: number
    /** First error AniList reported for the run, if any */
    reason: string | null
    onRetry: () => void
    onDismiss: () => void
}

export default function PartialFailureBar({ failedCount, reason, onRetry, onDismiss }: PartialFailureBarProps) {
    return (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-danger/10 border border-danger/25 px-3 py-2">
            <span className="flex items-start gap-2 text-sm text-fg min-w-0">
                <AlertTriangle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
                <span className="min-w-0">
                    {failedCount} {failedCount === 1 ? 'entry' : 'entries'} failed — still selected
                    {reason && <span className="block text-xs text-fg-muted truncate" title={reason}>{reason}</span>}
                </span>
            </span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={onRetry} className="btn-secondary h-8 px-3 text-xs">
                    <RotateCcw className="w-3.5 h-3.5" />
                    Retry failed
                </button>
                <button onClick={onDismiss} className="btn-icon w-8 h-8" title="Dismiss">
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
}
