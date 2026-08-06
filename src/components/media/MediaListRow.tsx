import { ReactNode } from 'react'
import { IKImage } from 'imagekitio-next'
import { MediaList, MediaType } from '@/types/anilist'
import { getStatusColor, getStatusLabel } from '@/lib/anilist'
import { formatProgress, formatScore, hasScore, formatMediaFormat } from '@/lib/entryDisplay'
import { cn } from '@/lib/utils'
import DefaultCover from '@/components/DefaultCover'
import { Star, ExternalLink, Edit3, Trash2, Check, Loader2, AlertCircle } from 'lucide-react'

interface MediaListRowProps {
    entry: MediaList
    currentType: MediaType
    bulkEditMode: boolean
    selected: boolean
    syncState?: 'pending' | 'error'
    onToggleSelect: () => void
    onStartEdit: () => void
    onDelete: () => void
    editForm?: ReactNode
}

export default function MediaListRow({
    entry,
    currentType,
    bulkEditMode,
    selected,
    syncState,
    onToggleSelect,
    onStartEdit,
    onDelete,
    editForm,
}: MediaListRowProps) {
    const title = entry.media?.title?.userPreferred || entry.media?.title?.romaji || 'Unknown'

    const handleRowClick = (e: React.MouseEvent) => {
        if (!bulkEditMode) return
        const target = e.target as HTMLElement
        if (target.closest('button, a, input, select, textarea')) return
        onToggleSelect()
    }

    return (
        <div
            className={cn(
                'group relative card p-3 flex items-center gap-3 transition-all duration-200',
                bulkEditMode && 'cursor-pointer',
                selected && 'ring-2 ring-purple',
                syncState === 'error' && 'ring-2 ring-danger',
                syncState === 'pending' && 'opacity-70'
            )}
            onClick={handleRowClick}
        >
            {/* Selection tint */}
            {selected && <div className="absolute inset-0 rounded-xl bg-purple/10 pointer-events-none" />}

            {/* Selection badge */}
            {bulkEditMode && (
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        onToggleSelect()
                    }}
                    className={cn(
                        'flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center border-2 transition-all duration-150',
                        selected
                            ? 'bg-purple border-purple text-white'
                            : 'border-edge text-transparent hover:border-purple'
                    )}
                    title={selected ? 'Deselect' : 'Select'}
                >
                    <Check className="w-3 h-3" strokeWidth={3} />
                </button>
            )}

            {/* Thumb */}
            <div className="w-11 h-[60px] rounded-md overflow-hidden flex-shrink-0 relative bg-raised">
                {entry.media?.coverImage?.medium ? (
                    <IKImage
                        src={entry.media.coverImage.medium}
                        alt={title}
                        fill
                        style={{ objectFit: 'cover' }}
                        sizes="44px"
                        transformation={[{ quality: 65, format: 'auto' }]}
                        loading="lazy"
                        lqip={{ active: true, quality: 20 }}
                    />
                ) : (
                    <DefaultCover className="w-full h-full rounded-md" size="small" />
                )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-fg truncate">{title}</h3>
                {editForm ? (
                    <div className="mt-2">{editForm}</div>
                ) : (
                    <div className="mt-1 flex items-center gap-3 text-xs text-fg-muted">
                        {entry.status && (
                            <span className="flex items-center gap-1.5">
                                <span className={cn('w-1.5 h-1.5 rounded-full', getStatusColor(entry.status))} />
                                {getStatusLabel(entry.status, currentType)}
                            </span>
                        )}
                        <span className="tabular-nums">{formatProgress(entry)}</span>
                        <span className="flex items-center gap-1 tabular-nums">
                            <Star className={cn('w-3 h-3', hasScore(entry) ? 'fill-current text-yellow-400' : 'text-fg-subtle')} />
                            {formatScore(entry)}
                        </span>
                        {entry.media?.format && (
                            <span className="hidden sm:inline text-fg-subtle">
                                {formatMediaFormat(entry.media.format)}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Sync badge */}
            {syncState === 'pending' && <Loader2 className="w-4 h-4 text-fg-muted animate-spin flex-shrink-0" />}
            {syncState === 'error' && (
                <span title="This entry failed to update — retry from the bulk bar">
                    <AlertCircle className="w-4 h-4 text-danger flex-shrink-0" />
                </span>
            )}

            {/* Actions */}
            {!editForm && (
                <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
                    <button
                        onClick={onStartEdit}
                        className="p-1.5 rounded-md text-fg-muted hover:text-fg hover:bg-raised transition-colors"
                        title="Quick edit"
                    >
                        <Edit3 className="w-4 h-4" />
                    </button>
                    <a
                        href={entry.media?.siteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-md text-fg-muted hover:text-fg hover:bg-raised transition-colors"
                        title="View on AniList"
                    >
                        <ExternalLink className="w-4 h-4" />
                    </a>
                    <button
                        onClick={onDelete}
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
