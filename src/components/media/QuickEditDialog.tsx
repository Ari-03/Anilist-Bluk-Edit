import { useId } from 'react'
import { Image as IKImage } from '@imagekit/next'
import { MediaList, MediaListStatus, MediaType } from '@/types/anilist'
import { getStatusLabel } from '@/lib/anilist'
import { ScoreRange } from '@/lib/scoreFormat'
import { cn } from '@/lib/utils'
import Modal, { ModalTitle } from '@/components/ui/Modal'
import { ExternalLink, Trash2 } from 'lucide-react'

/** Raw field text; parsed and validated on save so a half-typed value never snaps to 0 */
export interface QuickEditValues {
    status?: MediaListStatus
    score: string
    progress: string
    notes: string
}

interface QuickEditDialogProps {
    /** The entry being edited; null keeps the dialog closed */
    entry: MediaList | null
    values: QuickEditValues
    onChange: (values: QuickEditValues) => void
    onSave: () => void
    onCancel: () => void
    onDelete: (entry: MediaList) => void
    scoreRange: ScoreRange
    currentType: MediaType
    busy?: boolean
    /** Validation message for the field that failed, if any */
    error?: { field: 'score' | 'progress'; message: string } | null
}

const LABEL = 'block text-xs font-medium text-fg-muted mb-1'

/**
 * Single-entry editor, opened by clicking a card or row outside bulk mode.
 * Also where touch users find "View on AniList" and "Delete", which are
 * hover shortcuts on the cards for mouse users.
 */
export default function QuickEditDialog({
    entry,
    values,
    onChange,
    onSave,
    onCancel,
    onDelete,
    scoreRange,
    currentType,
    busy = false,
    error = null,
}: QuickEditDialogProps) {
    const fieldId = useId()
    const title = entry?.media?.title?.userPreferred || entry?.media?.title?.romaji || 'Unknown'
    const total = entry?.media?.episodes || entry?.media?.chapters

    return (
        // Capped to the screen and scrollable, so Save stays reachable on a landscape phone
        <Modal open={entry !== null} onClose={onCancel} dismissible={!busy} className="max-w-md max-h-full overflow-y-auto">
            {entry && (
                <form
                    className="p-4 space-y-4"
                    onSubmit={(e) => {
                        e.preventDefault()
                        onSave()
                    }}
                >
                    <div className="flex items-center gap-3">
                        {entry.media?.coverImage?.medium && (
                            <div className="relative w-10 h-14 rounded overflow-hidden flex-shrink-0 bg-raised">
                                <IKImage
                                    src={entry.media.coverImage.medium}
                                    alt=""
                                    fill
                                    style={{ objectFit: 'cover' }}
                                    sizes="40px"
                                    transformation={[{ quality: 65, format: 'auto' }]}
                                />
                            </div>
                        )}
                        <ModalTitle className="text-base font-semibold text-fg leading-snug line-clamp-2">{title}</ModalTitle>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                            <label htmlFor={`${fieldId}-status`} className={LABEL}>Status</label>
                            <select
                                id={`${fieldId}-status`}
                                value={values.status || ''}
                                onChange={(e) => onChange({ ...values, status: e.target.value as MediaListStatus })}
                                className="select"
                            >
                                {Object.values(MediaListStatus).map(status => (
                                    <option key={status} value={status}>
                                        {getStatusLabel(status, currentType)}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor={`${fieldId}-score`} className={LABEL}>Score</label>
                            <input
                                id={`${fieldId}-score`}
                                type="number"
                                inputMode="decimal"
                                value={values.score}
                                onChange={(e) => onChange({ ...values, score: e.target.value })}
                                min={scoreRange.min}
                                max={scoreRange.max}
                                step={scoreRange.step}
                                aria-invalid={error?.field === 'score'}
                                className={cn('input', error?.field === 'score' && 'border-danger')}
                            />
                        </div>
                        <div>
                            <label htmlFor={`${fieldId}-progress`} className={LABEL}>
                                Progress{total ? <span className="font-normal tabular-nums"> of {total}</span> : null}
                            </label>
                            <input
                                id={`${fieldId}-progress`}
                                type="number"
                                inputMode="numeric"
                                value={values.progress}
                                onChange={(e) => onChange({ ...values, progress: e.target.value })}
                                min={0}
                                max={total || 9999}
                                aria-invalid={error?.field === 'progress'}
                                className={cn('input', error?.field === 'progress' && 'border-danger')}
                            />
                        </div>
                        <div className="col-span-2">
                            <label htmlFor={`${fieldId}-notes`} className={LABEL}>Notes</label>
                            <textarea
                                id={`${fieldId}-notes`}
                                rows={2}
                                value={values.notes}
                                onChange={(e) => onChange({ ...values, notes: e.target.value })}
                                className="input h-auto min-h-[3.5rem] max-h-40 py-2 leading-snug resize-y"
                            />
                        </div>
                    </div>

                    {error && <p className="text-xs text-danger leading-snug" role="alert">{error.message}</p>}

                    <div className="flex flex-wrap items-center gap-2 border-t border-edge pt-4">
                        <a
                            href={entry.media?.siteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-ghost px-2.5"
                        >
                            <ExternalLink className="w-4 h-4" />
                            AniList
                        </a>
                        <button
                            type="button"
                            onClick={() => onDelete(entry)}
                            disabled={busy}
                            className="btn-ghost px-2.5 text-danger hover:bg-danger/10 hover:text-danger"
                        >
                            <Trash2 className="w-4 h-4" />
                            Delete
                        </button>
                        <div className="ml-auto flex gap-2">
                            <button type="button" onClick={onCancel} disabled={busy} className="btn-secondary">
                                Cancel
                            </button>
                            <button type="submit" disabled={busy} className="btn-primary">
                                Save
                            </button>
                        </div>
                    </div>
                </form>
            )}
        </Modal>
    )
}
