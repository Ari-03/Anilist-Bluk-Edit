import { MediaListStatus, MediaType, User } from '@/types/anilist'
import { getStatusLabel } from '@/lib/anilist'
import { getScoreRange, parseEditInput } from '@/lib/scoreFormat'
import { BulkFormOptions } from '@/hooks/useBulkOperations'
import CustomListsField from '@/components/bulk/CustomListsField'
import PacerStatus from '@/components/bulk/PacerStatus'
import { cn } from '@/lib/utils'

interface BulkEditFormProps {
    options: BulkFormOptions
    onChange: (options: BulkFormOptions) => void
    user: User | null
    currentType: MediaType
    availableCustomLists: string[]
    disabled?: boolean
}

export default function BulkEditForm({
    options,
    onChange,
    user,
    currentType,
    availableCustomLists,
    disabled,
}: BulkEditFormProps) {
    const scoreFormat = user?.mediaListOptions?.scoreFormat
    const scoreRange = getScoreRange(scoreFormat)
    const parsed = parseEditInput(options.score, options.progress, scoreFormat)
    const invalidField = parsed.ok ? null : parsed.field

    const fieldError = (field: 'score' | 'progress') =>
        !parsed.ok && parsed.field === field ? (
            <p className="mt-1 text-[11px] text-danger leading-snug">{parsed.message}</p>
        ) : null

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                    <label className="block text-xs font-medium text-fg-muted mb-1">Status</label>
                    <select
                        value={options.status}
                        onChange={(e) => onChange({ ...options, status: e.target.value as MediaListStatus | '' })}
                        className="select h-9 text-sm"
                        disabled={disabled}
                    >
                        <option value="">No change</option>
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
                        value={options.score}
                        onChange={(e) => onChange({ ...options, score: e.target.value })}
                        placeholder="No change"
                        min={scoreRange.min}
                        max={scoreRange.max}
                        step={scoreRange.step}
                        aria-invalid={invalidField === 'score'}
                        className={cn('input h-9 text-sm', invalidField === 'score' && 'border-danger')}
                        disabled={disabled}
                    />
                    {fieldError('score')}
                </div>

                <div>
                    <label className="block text-xs font-medium text-fg-muted mb-1">Progress</label>
                    <input
                        type="number"
                        inputMode="numeric"
                        value={options.progress}
                        onChange={(e) => onChange({ ...options, progress: e.target.value })}
                        placeholder="No change"
                        min={0}
                        aria-invalid={invalidField === 'progress'}
                        className={cn('input h-9 text-sm', invalidField === 'progress' && 'border-danger')}
                        disabled={disabled}
                    />
                    {fieldError('progress')}
                </div>

                <div>
                    <label className="block text-xs font-medium text-fg-muted mb-1">Privacy</label>
                    <select
                        value={options.private}
                        onChange={(e) => onChange({ ...options, private: e.target.value })}
                        className="select h-9 text-sm"
                        disabled={disabled}
                    >
                        <option value="">No change</option>
                        <option value="false">Public</option>
                        <option value="true">Private</option>
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-medium text-fg-muted mb-1">Status list visibility</label>
                    <select
                        value={options.hiddenFromStatusLists}
                        onChange={(e) => onChange({ ...options, hiddenFromStatusLists: e.target.value })}
                        className="select h-9 text-sm"
                        disabled={disabled}
                    >
                        <option value="">No change</option>
                        <option value="false">Visible</option>
                        <option value="true">Hidden</option>
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-medium text-fg-muted mb-1">Notes</label>
                    <input
                        type="text"
                        value={options.notes}
                        onChange={(e) => onChange({ ...options, notes: e.target.value })}
                        placeholder="No change"
                        className="input h-9 text-sm"
                        disabled={disabled}
                    />
                </div>
            </div>

            <div className="border-t border-edge pt-4">
                <CustomListsField
                    availableCustomLists={availableCustomLists}
                    value={options.customLists}
                    onChange={(customLists) => onChange({ ...options, customLists })}
                    currentType={currentType}
                    disabled={disabled}
                />
            </div>

            <div className="border-t border-edge pt-3">
                <PacerStatus />
            </div>
        </div>
    )
}
