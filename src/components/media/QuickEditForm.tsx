import { MediaList, MediaListStatus, MediaType } from '@/types/anilist'
import { getStatusLabel } from '@/lib/anilist'
import { ScoreRange } from '@/lib/scoreFormat'
import { cn } from '@/lib/utils'
import { Check, X } from 'lucide-react'

/** Raw field text; parsed and validated on save so a half-typed value never snaps to 0 */
export interface QuickEditValues {
    status?: MediaListStatus
    score: string
    progress: string
    notes: string
}

interface QuickEditFormProps {
    entry: MediaList
    values: QuickEditValues
    onChange: (values: QuickEditValues) => void
    onSave: () => void
    onCancel: () => void
    scoreRange: ScoreRange
    currentType: MediaType
    layout?: 'stacked' | 'row'
    busy?: boolean
    /** Validation message for the field that failed, if any */
    error?: { field: 'score' | 'progress'; message: string } | null
}

export default function QuickEditForm({
    entry,
    values,
    onChange,
    onSave,
    onCancel,
    scoreRange,
    currentType,
    layout = 'stacked',
    busy = false,
    error = null,
}: QuickEditFormProps) {
    const maxProgress = entry.media?.episodes || entry.media?.chapters || 9999

    const fields = (
        <>
            <div>
                <label className="block text-xs font-medium text-fg-muted mb-1">Status</label>
                <select
                    value={values.status || ''}
                    onChange={(e) => onChange({ ...values, status: e.target.value as MediaListStatus })}
                    className="select h-8 text-xs"
                >
                    {Object.values(MediaListStatus).map(status => (
                        <option key={status} value={status}>
                            {getStatusLabel(status, currentType)}
                        </option>
                    ))}
                </select>
            </div>
            <div>
                <label className="block text-xs font-medium text-fg-muted mb-1">Score</label>
                <input
                    type="number"
                    inputMode="decimal"
                    value={values.score}
                    onChange={(e) => onChange({ ...values, score: e.target.value })}
                    min={scoreRange.min}
                    max={scoreRange.max}
                    step={scoreRange.step}
                    aria-invalid={error?.field === 'score'}
                    className={cn('input h-8 text-xs', error?.field === 'score' && 'border-danger')}
                />
            </div>
            <div>
                <label className="block text-xs font-medium text-fg-muted mb-1">Progress</label>
                <input
                    type="number"
                    inputMode="numeric"
                    value={values.progress}
                    onChange={(e) => onChange({ ...values, progress: e.target.value })}
                    min={0}
                    max={maxProgress}
                    aria-invalid={error?.field === 'progress'}
                    className={cn('input h-8 text-xs', error?.field === 'progress' && 'border-danger')}
                />
            </div>
            {layout === 'row' && (
                <div>
                    <label className="block text-xs font-medium text-fg-muted mb-1">Notes</label>
                    <input
                        type="text"
                        value={values.notes}
                        onChange={(e) => onChange({ ...values, notes: e.target.value })}
                        className="input h-8 text-xs"
                    />
                </div>
            )}
        </>
    )

    return (
        <div className="space-y-2">
            <div className={layout === 'row' ? 'grid grid-cols-2 lg:grid-cols-4 gap-2' : 'space-y-2'}>
                {fields}
            </div>
            {error && <p className="text-[11px] text-danger leading-snug">{error.message}</p>}
            <div className="flex justify-end gap-1">
                <button
                    onClick={onSave}
                    disabled={busy}
                    className="p-1.5 rounded-md text-success hover:bg-success/10 transition-colors disabled:opacity-50"
                    title="Save"
                >
                    <Check className="w-4 h-4" />
                </button>
                <button
                    onClick={onCancel}
                    disabled={busy}
                    className="p-1.5 rounded-md text-fg-muted hover:bg-raised transition-colors disabled:opacity-50"
                    title="Cancel"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
}
