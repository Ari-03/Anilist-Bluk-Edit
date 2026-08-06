import { useState } from 'react'
import { MediaListStatus, MediaType, User } from '@/types/anilist'
import { getStatusLabel } from '@/lib/anilist'
import { getScoreRange } from '@/lib/scoreFormat'
import { BulkFormOptions } from '@/hooks/useBulkOperations'
import { RateLimiterStats } from '@/lib/rateLimiter'
import { RateLimiterConfig } from '@/hooks/useBulkOperations'
import CustomListsField from '@/components/bulk/CustomListsField'
import RateLimitSettings from '@/components/bulk/RateLimitSettings'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BulkEditFormProps {
    options: BulkFormOptions
    onChange: (options: BulkFormOptions) => void
    user: User | null
    currentType: MediaType
    availableCustomLists: string[]
    disabled?: boolean
    rateLimiterConfig: RateLimiterConfig
    onRateLimiterConfigChange: (config: RateLimiterConfig) => void
    rateLimiterStats: RateLimiterStats | null
}

export default function BulkEditForm({
    options,
    onChange,
    user,
    currentType,
    availableCustomLists,
    disabled,
    rateLimiterConfig,
    onRateLimiterConfigChange,
    rateLimiterStats,
}: BulkEditFormProps) {
    const [showAdvanced, setShowAdvanced] = useState(false)
    const scoreRange = getScoreRange(user?.mediaListOptions?.scoreFormat)

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
                        value={options.score}
                        onChange={(e) => onChange({ ...options, score: e.target.value })}
                        placeholder="No change"
                        min={scoreRange.min}
                        max={scoreRange.max}
                        step={scoreRange.step}
                        className="input h-9 text-sm"
                        disabled={disabled}
                    />
                </div>

                <div>
                    <label className="block text-xs font-medium text-fg-muted mb-1">Progress</label>
                    <input
                        type="number"
                        value={options.progress}
                        onChange={(e) => onChange({ ...options, progress: e.target.value })}
                        placeholder="No change"
                        min={0}
                        className="input h-9 text-sm"
                        disabled={disabled}
                    />
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
                <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-1 text-xs font-medium text-fg-muted hover:text-fg transition-colors"
                >
                    <ChevronDown className={cn('w-3.5 h-3.5 transition-transform duration-150', showAdvanced && 'rotate-180')} />
                    Advanced · rate limiting
                </button>
                {showAdvanced && (
                    <div className="mt-3">
                        <RateLimitSettings
                            config={rateLimiterConfig}
                            onChange={onRateLimiterConfigChange}
                            stats={rateLimiterStats}
                            disabled={disabled}
                        />
                    </div>
                )}
            </div>
        </div>
    )
}
