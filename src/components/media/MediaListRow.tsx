import { memo } from 'react'
import { Image as IKImage } from '@imagekit/next'
import { MediaList, MediaType } from '@/types/anilist'
import { getStatusColor, getStatusLabel } from '@/lib/anilist'
import { formatProgress, formatScore, hasScore, notableFormat } from '@/lib/entryDisplay'
import { cn } from '@/lib/utils'
import DefaultCover from '@/components/DefaultCover'
import { Star, ExternalLink, Edit3, Trash2, Check, Loader2, AlertCircle } from 'lucide-react'

interface MediaListRowProps {
    entry: MediaList
    currentType: MediaType
    bulkEditMode: boolean
    selected: boolean
    selectionActive?: boolean
    showStatus?: boolean
    syncState?: 'pending' | 'error'
    // Take the entry (or id) so one stable callback serves every card and memo holds
    onToggleSelect: (id: number) => void
    onStartEdit: (entry: MediaList) => void
    onDelete: (entry: MediaList) => void
}

/**
 * One entry as a compact row. From md up the status, progress, score and
 * format sit in fixed-width columns so they line up down the list; on phones
 * they wrap under the title.
 */
function MediaListRow({
    entry,
    currentType,
    bulkEditMode,
    selected,
    selectionActive = false,
    showStatus = true,
    syncState,
    onToggleSelect,
    onStartEdit,
    onDelete,
}: MediaListRowProps) {
    const title = entry.media?.title?.userPreferred || entry.media?.title?.romaji || 'Unknown'
    const format = notableFormat(entry.media?.format, currentType)

    // The whole row is one target: it selects in bulk mode and opens the entry otherwise
    const handleRowClick = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement
        if (target.closest('button, a, input, select, textarea')) return
        if (bulkEditMode) onToggleSelect(entry.id)
        else onStartEdit(entry)
    }

    return (
        <div
            className={cn(
                'group relative card px-3 py-2 flex items-center gap-3 cursor-pointer transition-all duration-200 hover:bg-raised',
                // Inset so the outline survives the list's content-visibility paint containment
                selected && 'ring-2 ring-inset ring-tint',
                selectionActive && !selected && !syncState && 'opacity-60 hover:opacity-100',
                syncState === 'error' && 'ring-2 ring-inset ring-danger',
                syncState === 'pending' && 'opacity-70'
            )}
            onClick={handleRowClick}
        >
            {/* Selection badge */}
            {bulkEditMode && (
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        onToggleSelect(entry.id)
                    }}
                    className={cn(
                        // The ::before pads the 20px badge out to a 44px touch target
                        'relative flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center border-2 transition-all duration-150 before:absolute before:-inset-3',
                        selected
                            ? 'bg-tint border-tint text-white'
                            : 'border-edge-strong text-transparent hover:border-tint'
                    )}
                    role="checkbox"
                    aria-checked={selected}
                    aria-label={`Select ${title}`}
                    title={selected ? 'Deselect' : 'Select'}
                >
                    <Check className="w-3 h-3" strokeWidth={3} />
                </button>
            )}

            {/* Thumb */}
            <div className="w-8 h-11 rounded overflow-hidden flex-shrink-0 relative bg-raised">
                {entry.media?.coverImage?.medium ? (
                    <IKImage
                        src={entry.media.coverImage.medium}
                        alt=""
                        fill
                        style={{ objectFit: 'cover' }}
                        sizes="32px"
                        transformation={[{ quality: 65, format: 'auto' }]}
                        loading="lazy"
                    />
                ) : (
                    <DefaultCover className="w-full h-full rounded" size="small" />
                )}
            </div>

            {/* Title, then the numbers as aligned columns */}
            <div className="flex-1 min-w-0 md:flex md:items-center md:gap-4">
                <div className="flex min-w-0 items-baseline gap-2 md:flex-1">
                    <h3 className="text-sm font-semibold text-fg truncate">{title}</h3>
                    {format && <span className="flex-shrink-0 text-xs text-fg-subtle">{format}</span>}
                </div>
                <div className="mt-0.5 md:mt-0 flex items-center gap-3 md:gap-4 text-xs text-fg-muted">
                    {showStatus && entry.status && (
                        <span className="flex items-center gap-1.5 md:w-24">
                            <span className={cn('w-1.5 h-1.5 rounded-full', getStatusColor(entry.status))} />
                            {getStatusLabel(entry.status, currentType)}
                        </span>
                    )}
                    <span className="tabular-nums md:w-20 md:text-right">{formatProgress(entry)}</span>
                    <span className="flex items-center gap-1 tabular-nums md:w-12 md:justify-end">
                        <Star className={cn('w-3 h-3', hasScore(entry) ? 'fill-current text-yellow-400' : 'text-fg-subtle')} />
                        {formatScore(entry)}
                    </span>
                </div>
            </div>

            {/* Sync badge */}
            {syncState === 'pending' && <Loader2 className="w-4 h-4 text-fg-muted animate-spin flex-shrink-0" />}
            {syncState === 'error' && (
                <span title="This entry failed to update — retry from the bulk bar">
                    <AlertCircle className="w-4 h-4 text-danger flex-shrink-0" />
                </span>
            )}

            {/* Shortcuts laid over the row's right edge, so they reserve no space. Shown
                on hover with a mouse and on keyboard focus everywhere. Touch has no
                hover, so taps pass through to the row, which opens the entry where
                the same actions are labelled buttons */}
            {!bulkEditMode && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 rounded-md bg-raised opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:pointer-events-none focus-within:pointer-events-auto transition-opacity duration-150">
                    <button
                        onClick={() => onStartEdit(entry)}
                        className="p-1.5 rounded-md text-fg-muted hover:text-fg hover:bg-edge/60 transition-colors"
                        title="Quick edit"
                    >
                        <Edit3 className="w-4 h-4" />
                    </button>
                    <a
                        href={entry.media?.siteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-md text-fg-muted hover:text-fg hover:bg-edge/60 transition-colors"
                        title="View on AniList"
                    >
                        <ExternalLink className="w-4 h-4" />
                    </a>
                    <button
                        onClick={() => onDelete(entry)}
                        className="p-1.5 rounded-md text-fg-muted hover:text-danger hover:bg-danger/10 transition-colors"
                        title="Delete entry"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    )
}

export default memo(MediaListRow)
