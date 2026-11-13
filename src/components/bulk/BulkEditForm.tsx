import { useId } from 'react'
import { MediaListStatus, MediaType, User } from '@/types/anilist'
import { getStatusLabel } from '@/lib/anilist'
import { getScoreRange, parseEditInput } from '@/lib/scoreFormat'
import { BulkFormOptions } from '@/hooks/useBulkOperations'
import CustomListsField from '@/components/bulk/CustomListsField'
import FavouriteField from '@/components/bulk/FavouriteField'
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
    const fieldId = useId()
    const scoreFormat = user?.mediaListOptions?.scoreFormat
    const scoreRange = getScoreRange(scoreFormat)
    const parsed = parseEditInput(options.score, options.progress, scoreFormat)
    const invalidField = parsed.ok ? null : parsed.field

    const fieldError = (field: 'score' | 'progress') =>
        !parsed.ok && parsed.field === field ? (
            <p className="mt-1 text-xs text-danger leading-snug">{parsed.message}</p>
        ) : null

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                    <label htmlFor={`${fieldId}-f1`} className="block text-xs font-medium text-fg-muted mb-1">Status</label>
                    <select
                        id={`${fieldId}-f1`}
                        value={options.status}
                        onChange={(e) => onChange({ ...options, status: e.target.value as MediaListStatus | '' })}
                        className="select"
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
                    <label htmlFor={`${fieldId}-f2`} className="block text-xs font-medium text-fg-muted mb-1">Score</label>
                    <input
                        id={`${fieldId}-f2`}
                        type="number"
                        inputMode="decimal"
                        value={options.score}
                        onChange={(e) => onChange({ ...options, score: e.target.value })}
                        placeholder="No change"
                        min={scoreRange.min}
                        max={scoreRange.max}
                        step={scoreRange.step}
                        aria-invalid={invalidField === 'score'}
                        className={cn('input', invalidField === 'score' && 'border-danger')}
                        disabled={disabled}
                    />
                    {fieldError('score')}
                </div>

                <div>
                    <label htmlFor={`${fieldId}-f3`} className="block text-xs font-medium text-fg-muted mb-1">Progress</label>
                    <input
                        id={`${fieldId}-f3`}
                        type="number"
                        inputMode="numeric"
                        value={options.progress}
                        onChange={(e) => onChange({ ...options, progress: e.target.value })}
                        placeholder="No change"
                        min={0}
                        aria-invalid={invalidField === 'progress'}
                        className={cn('input', invalidField === 'progress' && 'border-danger')}
                        disabled={disabled}
                    />
                    {fieldError('progress')}
                </div>

                <div>
                    <label htmlFor={`${fieldId}-f4`} className="block text-xs font-medium text-fg-muted mb-1">Privacy</label>
                    <select
                        id={`${fieldId}-f4`}
                        value={options.private}
                        onChange={(e) => onChange({ ...options, private: e.target.value })}
                        className="select"
                        disabled={disabled}
                    >
                        <option value="">No change</option>
                        <option value="false">Public</option>
                        <option value="true">Private</option>
                    </select>
                </div>

                <div>
                    <label htmlFor={`${fieldId}-f5`} className="block text-xs font-medium text-fg-muted mb-1">Status list visibility</label>
                    <select
                        id={`${fieldId}-f5`}
                        value={options.hiddenFromStatusLists}
                        onChange={(e) => onChange({ ...options, hiddenFromStatusLists: e.target.value })}
                        className="select"
                        disabled={disabled}
                    >
                        <option value="">No change</option>
                        <option value="false">Visible</option>
                        <option value="true">Hidden</option>
                    </select>
                </div>

                <FavouriteField
                    id={`${fieldId}-fav`}
                    value={options.favourite}
                    onChange={(favourite) => onChange({ ...options, favourite })}
                    disabled={disabled}
                />

                {/* AniList list notes are plain text (no Markdown), line breaks kept */}
                <div className="col-span-full">
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                        <label htmlFor={`${fieldId}-f6`} className="text-xs font-medium text-fg-muted">Notes</label>
                        <span className={cn('text-xs text-right', options.notes.trim() ? 'text-warning' : 'text-fg-subtle')}>
                            Replaces existing notes
                        </span>
                    </div>
                    <textarea
                        id={`${fieldId}-f6`}
                        rows={3}
                        value={options.notes}
                        onChange={(e) => onChange({ ...options, notes: e.target.value })}
                        placeholder="No change"
                        className="input h-auto min-h-[4.5rem] max-h-40 py-2 leading-snug resize-y"
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

        </div>
    )
}
