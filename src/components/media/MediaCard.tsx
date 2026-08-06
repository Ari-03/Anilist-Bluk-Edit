import { ReactNode } from 'react'
import { IKImage } from 'imagekitio-next'
import { MediaList, MediaType } from '@/types/anilist'
import { getStatusColor, getStatusLabel } from '@/lib/anilist'
import { formatProgress, formatScore, hasScore, progressPercent, formatMediaFormat } from '@/lib/entryDisplay'
import { cn } from '@/lib/utils'
import DefaultCover from '@/components/DefaultCover'
import { Star, Play, Book, ExternalLink, Edit3, Trash2, Check, Loader2, AlertCircle } from 'lucide-react'

interface MediaCardProps {
    entry: MediaList
    currentType: MediaType
    bulkEditMode: boolean
    selected: boolean
    syncState?: 'pending' | 'error'
    onToggleSelect: () => void
    onStartEdit: () => void
    onDelete: () => void
    /** Rendered below the cover when the entry is being quick-edited */
    editForm?: ReactNode
}

export default function MediaCard({
    entry,
    currentType,
    bulkEditMode,
    selected,
    syncState,
    onToggleSelect,
    onStartEdit,
    onDelete,
    editForm,
}: MediaCardProps) {
    const coverColor = entry.media?.coverImage?.color || undefined
    const pct = progressPercent(entry)
    const title = entry.media?.title?.userPreferred || entry.media?.title?.romaji || 'Unknown'
    const ProgressIcon = currentType === MediaType.ANIME ? Play : Book

    const handleCardClick = (e: React.MouseEvent) => {
        if (!bulkEditMode) return
        const target = e.target as HTMLElement
        if (target.closest('button, a, input, select, textarea')) return
        onToggleSelect()
    }

    return (
        <div
            className={cn(
                'group relative card overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_-8px_var(--glow,rgb(0_0_0/0.35))]',
                bulkEditMode && 'cursor-pointer',
                selected && 'ring-2 ring-purple shadow-raised',
                syncState === 'error' && 'ring-2 ring-danger',
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
                        lqip={{ active: true, quality: 20 }}
                    />
                ) : (
                    <DefaultCover className="w-full h-full" size="large" />
                )}

                {/* Bottom scrim + title */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent pt-10 px-2.5 pb-2.5">
                    <h3 className="text-[13px] font-semibold leading-snug text-white line-clamp-2 [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]">
                        {title}
                    </h3>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-white/85">
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

                {/* Status chip */}
                {entry.status && (
                    <div className="absolute top-2 right-2 flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-sm px-2 py-0.5">
                        <span className={cn('w-1.5 h-1.5 rounded-full', getStatusColor(entry.status))} />
                        <span className="text-[10px] font-medium text-white">
                            {getStatusLabel(entry.status, currentType)}
                        </span>
                    </div>
                )}

                {/* Format tag */}
                {entry.media?.format && (
                    <div className="absolute top-2 left-2 rounded-md bg-black/60 backdrop-blur-sm px-1.5 py-0.5 text-[10px] font-medium text-white/90 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                        {formatMediaFormat(entry.media.format)}
                    </div>
                )}

                {/* Selection wash */}
                {selected && <div className="absolute inset-0 bg-purple/20 pointer-events-none" />}

                {/* Selection badge */}
                {bulkEditMode && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            onToggleSelect()
                        }}
                        className={cn(
                            'absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all duration-150',
                            selected
                                ? 'bg-purple border-purple text-white scale-100 opacity-100'
                                : 'bg-black/40 border-white/70 text-transparent opacity-0 group-hover:opacity-100'
                        )}
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

                {/* Hover actions */}
                {!bulkEditMode && !editForm && (
                    <div className="absolute top-9 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0 transition-all duration-150">
                        <button
                            onClick={onStartEdit}
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
                            onClick={onDelete}
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

            {/* Quick edit form */}
            {editForm && <div className="p-3">{editForm}</div>}
        </div>
    )
}
