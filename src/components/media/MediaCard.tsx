import { memo } from 'react'
import { Image as IKImage } from '@imagekit/next'
import { MediaList, MediaType } from '@/types/anilist'
import { getStatusColor, getStatusLabel } from '@/lib/anilist'
import { formatProgress, formatScore, hasScore, progressPercent, notableFormat } from '@/lib/entryDisplay'
import { cn } from '@/lib/utils'
import DefaultCover from '@/components/DefaultCover'
import { Star, Play, Book, ExternalLink, Edit3, Trash2, Check, Loader2, AlertCircle } from 'lucide-react'

interface MediaCardProps {
    entry: MediaList
    currentType: MediaType
    bulkEditMode: boolean
    selected: boolean
    /** Some entries are selected: unselected ones recede so the selection reads at a glance */
    selectionActive?: boolean
    /** Status sections already label the status, so cards only show it in flat views */
    showStatus?: boolean
    syncState?: 'pending' | 'error'
    // Take the entry (or id) so one stable callback serves every card and memo holds
    onToggleSelect: (id: number) => void
    onStartEdit: (entry: MediaList) => void
    onDelete: (entry: MediaList) => void
}

function MediaCard({
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
}: MediaCardProps) {
    const coverColor = entry.media?.coverImage?.color || undefined
    const pct = progressPercent(entry)
    const title = entry.media?.title?.userPreferred || entry.media?.title?.romaji || 'Unknown'
    const ProgressIcon = currentType === MediaType.ANIME ? Play : Book

    const format = notableFormat(entry.media?.format, currentType)

    // The whole card is one target: it selects in bulk mode and opens the entry otherwise
    const handleCardClick = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement
        if (target.closest('button, a, input, select, textarea')) return
        if (bulkEditMode) onToggleSelect(entry.id)
        else onStartEdit(entry)
    }

    return (
        <div
            className={cn(
                'group relative card overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:shadow-[0_10px_28px_-8px_var(--glow,rgb(0_0_0/0.35))]',
                selected && 'shadow-raised',
                syncState === 'pending' && 'opacity-70'
            )}
            style={coverColor ? ({ '--glow': `${coverColor}59` } as React.CSSProperties) : undefined}
            onClick={handleCardClick}
        >
            {/* Cover */}
            <div
                className="relative aspect-[3/4] bg-raised"
                style={coverColor ? { backgroundColor: coverColor } : undefined}
            >
                {entry.media?.coverImage?.large ? (
                    <IKImage
                        src={entry.media.coverImage.large}
                        alt={title}
                        fill
                        style={{ objectFit: 'cover' }}
                        sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                        transformation={[{ quality: 80, format: 'auto' }]}
                        loading="lazy"
                    />
                ) : (
                    <DefaultCover className="w-full h-full" size="large" />
                )}

                {/* Unselected covers recede under a scrim; the title and numbers above it stay readable */}
                {selectionActive && !selected && !syncState && (
                    <div className="absolute inset-0 bg-black/55 transition-opacity duration-150 group-hover:opacity-0" />
                )}

                {/* Bottom scrim + title */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/70 via-60% to-transparent pt-12 px-2.5 pb-2.5">
                    <h3 className="text-sm font-semibold leading-snug text-white line-clamp-3 [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]">
                        {title}
                    </h3>
                    <div className="mt-1 flex items-center justify-between text-xs text-white">
                        <span className="flex items-center gap-1 tabular-nums">
                            <ProgressIcon className="w-3 h-3" />
                            {formatProgress(entry)}
                        </span>
                        <span className="flex items-center gap-1 tabular-nums">
                            <Star className={cn('w-3 h-3', hasScore(entry) ? 'fill-current text-yellow-400' : 'text-white/40')} />
                            {formatScore(entry)}
                        </span>
                    </div>
                </div>

                {/* Status chip (flat views), otherwise the format tag */}
                {showStatus && entry.status ? (
                    <div className="absolute top-2 right-2 flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-sm px-2 py-0.5">
                        <span className={cn('w-1.5 h-1.5 rounded-full', getStatusColor(entry.status))} />
                        <span className="text-xs font-medium text-white">
                            {getStatusLabel(entry.status, currentType)}
                        </span>
                    </div>
                ) : format ? (
                    <div className="absolute top-2 right-2 rounded-md bg-black/60 backdrop-blur-sm px-1.5 py-0.5 text-xs font-medium text-white/90">
                        {format}
                    </div>
                ) : null}

                {/* Selection badge */}
                {bulkEditMode && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            onToggleSelect(entry.id)
                        }}
                        className={cn(
                            // The ::before pads the 24px badge out to a 44px touch target
                            'absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all duration-150 before:absolute before:-inset-2.5',
                            selected
                                ? 'bg-tint border-tint text-white'
                                : 'bg-black/50 border-white/80 text-transparent group-hover:text-white/70'
                        )}
                        role="checkbox"
                    aria-checked={selected}
                    aria-label={`Select ${title}`}
                    title={selected ? 'Deselect' : 'Select'}
                    >
                        <Check className="w-3.5 h-3.5" strokeWidth={3} />
                    </button>
                )}

                {/* Sync badges */}
                {syncState === 'pending' && (
                    <div className="absolute bottom-2 left-2 w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
                        <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                    </div>
                )}
                {syncState === 'error' && (
                    <div className="absolute bottom-2 left-2 w-6 h-6 rounded-full bg-danger flex items-center justify-center" title="This entry failed to update — retry from the bulk bar">
                        <AlertCircle className="w-3.5 h-3.5 text-white" />
                    </div>
                )}

                {/* Hover shortcuts */}
                {!bulkEditMode && (
                    /* Revealed on hover or keyboard focus. Touch has no hover: tapping the
                       card opens the entry, where the same actions are labelled buttons */
                    <div
                        className={cn(
                            'absolute right-2 flex flex-col gap-1 opacity-0 translate-x-1 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-hover:translate-x-0 focus-within:opacity-100 focus-within:translate-x-0 [@media(hover:none)]:pointer-events-none focus-within:pointer-events-auto transition-all duration-150 motion-reduce:transition-none motion-reduce:translate-x-0',
                            // Sit below the status or format chip when the card has one
                            (showStatus && entry.status) || format ? 'top-9' : 'top-2'
                        )}
                    >
                        <button
                            onClick={() => onStartEdit(entry)}
                            className="w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm text-white flex items-center justify-center hover:bg-accent transition-colors"
                            title="Quick edit"
                        >
                            <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <a
                            href={entry.media?.siteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm text-white flex items-center justify-center hover:bg-accent transition-colors"
                            title="View on AniList"
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button
                            onClick={() => onDelete(entry)}
                            className="w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm text-white flex items-center justify-center hover:bg-danger transition-colors"
                            title="Delete entry"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}

                {/* Progress hairline */}
                {pct !== null && pct > 0 && (
                    <div className="absolute bottom-0 inset-x-0 h-[3px] bg-black/40">
                        <div
                            className="h-full transition-[width] duration-300"
                            style={{ width: `${pct}%`, backgroundColor: coverColor || 'rgb(var(--c-accent))' }}
                        />
                    </div>
                )}
            </div>

            {/* Selected / failed outline. Drawn inside the card because big lists use
                content-visibility, whose paint containment clips rings outside the box */}
            {(selected || syncState === 'error') && (
                <div
                    className={cn(
                        'pointer-events-none absolute inset-0 rounded-xl border-[3px]',
                        syncState === 'error' ? 'border-danger' : 'border-tint'
                    )}
                />
            )}
        </div>
    )
}

export default memo(MediaCard)
