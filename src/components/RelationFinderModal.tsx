import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { Image as IKImage } from '@imagekit/next'
import { useStore } from '@/store'
import { AniListClient } from '@/lib/anilist'
import { getStatusColor, getStatusLabel } from '@/lib/anilist'
import { MediaList, MediaListStatus, MediaType } from '@/types/anilist'
import { RateLimiter } from '@/lib/rateLimiter'
import { discoverRelations, DiscoveredRelation, DiscoveryProgress } from '@/lib/relationDiscovery'
import { formatMediaFormat } from '@/lib/entryDisplay'
import ProgressBar from '@/components/ui/ProgressBar'
import DefaultCover from '@/components/DefaultCover'
import { cn } from '@/lib/utils'
import { X, Loader2, GitBranch, AlertTriangle, Search, Check } from 'lucide-react'

interface RelationFinderModalProps {
    open: boolean
    onClose: () => void
    client: AniListClient | null
    seedEntries: MediaList[]
}

type Phase = 'discovering' | 'review' | 'applying'

const CORE_ANIME_FORMATS = new Set(['TV', 'TV_SHORT', 'MOVIE'])
const UNFINISHED_STATUSES = new Set(['RELEASING', 'NOT_YET_RELEASED'])

const chunk = <T,>(arr: T[], size: number): T[][] =>
    Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
        arr.slice(i * size, i * size + size)
    )

/**
 * Finds every sequel/prequel of the selected entries (BFS over AniList's
 * relation graph), then lets the user pick which to add to their list —
 * built for "my import only brought over season 1".
 */
export default function RelationFinderModal({ open, onClose, client, seedEntries }: RelationFinderModalProps) {
    const { user, currentType, addNotification } = useStore()

    const [phase, setPhase] = useState<Phase>('discovering')
    const [discoveries, setDiscoveries] = useState<DiscoveredRelation[]>([])
    const [scanProgress, setScanProgress] = useState<DiscoveryProgress>({ round: 0, found: 0 })
    const [checked, setChecked] = useState<Set<number>>(new Set())
    const [includeExtraFormats, setIncludeExtraFormats] = useState(false)
    const [targetStatus, setTargetStatus] = useState<MediaListStatus>(MediaListStatus.COMPLETED)
    const [applyProgress, setApplyProgress] = useState({ current: 0, total: 0, failed: 0 })

    const cancelRef = useRef(false)
    const isAnime = currentType === MediaType.ANIME

    // Kick off discovery whenever the modal opens
    useEffect(() => {
        if (!open || !client) return
        cancelRef.current = false
        setPhase('discovering')
        setDiscoveries([])
        setScanProgress({ round: 0, found: 0 })
        setChecked(new Set())
        setTargetStatus(MediaListStatus.COMPLETED)

        const rateLimiter = new RateLimiter({
            maxRequestsPerSecond: 0.5,
            maxConcurrentRequests: 1,
            maxRetries: 3,
            initialRetryDelay: 2000,
        })

        discoverRelations({
            client,
            rateLimiter,
            seedMediaIds: seedEntries.map(e => e.mediaId),
            mediaType: currentType,
            onProgress: setScanProgress,
            isCancelled: () => cancelRef.current,
        })
            .then(found => {
                if (cancelRef.current) return
                setDiscoveries(found)
                // Sensible defaults: pre-check anything not already completed
                // and not still airing/unreleased
                setChecked(new Set(
                    found
                        .filter(d =>
                            d.media.mediaListEntry?.status !== MediaListStatus.COMPLETED &&
                            !UNFINISHED_STATUSES.has(d.media.status || '')
                        )
                        .map(d => d.media.id)
                ))
                setPhase('review')
            })
            .catch(error => {
                if (cancelRef.current) return
                console.error('Relation discovery failed:', error)
                addNotification({ type: 'error', message: 'Failed to scan relations — try again in a minute' })
                onClose()
            })

        return () => {
            cancelRef.current = true
            rateLimiter.stop()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    const visible = useMemo(() => {
        const list = isAnime && !includeExtraFormats
            ? discoveries.filter(d => CORE_ANIME_FORMATS.has(d.media.format || ''))
            : discoveries
        return [...list].sort((a, b) =>
            (a.media.startDate?.year || 9999) - (b.media.startDate?.year || 9999)
        )
    }, [discoveries, isAnime, includeExtraFormats])

    const selectedCount = visible.filter(d => checked.has(d.media.id)).length

    const toggle = (id: number) => {
        setChecked(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const handleApply = async () => {
        if (!client) return
        const targets = visible.filter(d => checked.has(d.media.id))
        if (targets.length === 0) return

        setPhase('applying')
        setApplyProgress({ current: 0, total: targets.length, failed: 0 })
        cancelRef.current = false

        const rateLimiter = new RateLimiter({
            maxRequestsPerSecond: 0.5,
            maxConcurrentRequests: 1,
            maxRetries: 3,
            initialRetryDelay: 2000,
        })

        const entries = targets.map(d => {
            const updates: Record<string, any> = { status: targetStatus }
            const total = d.media.episodes ?? d.media.chapters
            const existing = d.media.mediaListEntry?.progress || 0
            // Fill progress only when completing and it wouldn't downgrade
            if (targetStatus === MediaListStatus.COMPLETED && total && total > existing) {
                updates.progress = total
            }
            return { mediaId: d.media.id, updates }
        })

        let done = 0
        let failed = 0
        for (const batch of chunk(entries, 10)) {
            if (cancelRef.current) break
            try {
                await rateLimiter.execute(() => client.bulkSaveMediaListEntries(batch))
                done += batch.length
            } catch (error) {
                console.error('Failed to save relation batch:', error)
                failed += batch.length
            }
            setApplyProgress({ current: done + failed, total: targets.length, failed })
        }

        addNotification({
            type: failed === 0 ? 'success' : 'warning',
            message: failed === 0
                ? `Added ${done} ${done === 1 ? 'entry' : 'entries'} as ${getStatusLabel(targetStatus, currentType)}`
                : `Added ${done}, ${failed} failed — try again for the rest`,
        })

        // New entries don't exist locally yet, so this one case really does
        // need a refetch to pull them in (runs behind the slim refresh bar)
        if (user && done > 0) {
            useStore.getState().fetchMediaLists(user.id, currentType, true).catch(() => { })
        }
        onClose()
    }

    const statusBadge = (d: DiscoveredRelation) => {
        const entry = d.media.mediaListEntry
        if (!entry) {
            return <span className="text-[11px] font-medium text-fg-subtle whitespace-nowrap">Not on list</span>
        }
        return (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-fg-muted whitespace-nowrap">
                <span className={cn('w-1.5 h-1.5 rounded-full', getStatusColor(entry.status as MediaListStatus))} />
                {getStatusLabel(entry.status as MediaListStatus, currentType)}
                {entry.progress ? ` · ${entry.progress}` : ''}
            </span>
        )
    }

    return (
        <AnimatePresence>
            {open && (
                <m.div
                    className="fixed inset-0 z-modal flex items-center justify-center p-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                >
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
                        onClick={phase === 'applying' ? undefined : onClose}
                    />
                    <m.div
                        role="dialog"
                        aria-modal="true"
                        className="relative w-full max-w-2xl card shadow-overlay flex flex-col max-h-[85vh]"
                        initial={{ opacity: 0, scale: 0.96, y: 12 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: 6 }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-5 pb-4 border-b border-edge">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
                                    <GitBranch className="w-[18px] h-[18px] text-accent" />
                                </div>
                                <div>
                                    <h3 className="text-base font-semibold text-fg">Sequels & prequels</h3>
                                    <p className="text-xs text-fg-muted">
                                        From {seedEntries.length} selected {seedEntries.length === 1 ? 'entry' : 'entries'}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                disabled={phase === 'applying'}
                                className="btn-icon"
                                title="Close"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto p-5">
                            {phase === 'discovering' && (
                                <div className="flex flex-col items-center py-12 text-center">
                                    <Loader2 className="w-8 h-8 text-accent animate-spin mb-4" />
                                    <p className="text-sm font-medium text-fg">Scanning the relation graph…</p>
                                    <p className="mt-1 text-xs text-fg-muted tabular-nums">
                                        {scanProgress.round > 0
                                            ? `Round ${scanProgress.round} · ${scanProgress.found} related ${scanProgress.found === 1 ? 'title' : 'titles'} found`
                                            : 'Warming up'}
                                    </p>
                                    <p className="mt-4 text-[11px] text-fg-subtle max-w-xs">
                                        Chains are followed season by season, so long franchises can take a
                                        few requests (rate-limit friendly).
                                    </p>
                                </div>
                            )}

                            {phase === 'review' && (
                                visible.length === 0 ? (
                                    <div className="flex flex-col items-center py-12 text-center">
                                        <Search className="w-8 h-8 text-fg-subtle mb-4" />
                                        <p className="text-sm font-medium text-fg">No sequels or prequels found</p>
                                        <p className="mt-1 text-xs text-fg-muted max-w-xs">
                                            {discoveries.length > 0
                                                ? 'Some related titles were skipped by the format filter — include specials & OVAs below.'
                                                : 'The selected entries have no related seasons on AniList.'}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-1">
                                        {visible.map(d => {
                                            const isChecked = checked.has(d.media.id)
                                            const unfinished = UNFINISHED_STATUSES.has(d.media.status || '')
                                            const title = d.media.title?.userPreferred || d.media.title?.romaji || 'Unknown'
                                            return (
                                                <button
                                                    key={d.media.id}
                                                    onClick={() => toggle(d.media.id)}
                                                    className={cn(
                                                        'w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors',
                                                        isChecked ? 'bg-accent/10' : 'hover:bg-raised'
                                                    )}
                                                >
                                                    <span
                                                        className={cn(
                                                            'flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center border-2 transition-colors',
                                                            isChecked ? 'bg-accent border-accent text-white' : 'border-edge text-transparent'
                                                        )}
                                                    >
                                                        <Check className="w-3 h-3" strokeWidth={3} />
                                                    </span>

                                                    <span className="w-9 h-12 rounded overflow-hidden flex-shrink-0 relative bg-raised">
                                                        {d.media.coverImage?.medium ? (
                                                            <IKImage
                                                                src={d.media.coverImage.medium}
                                                                alt={title}
                                                                fill
                                                                style={{ objectFit: 'cover' }}
                                                                sizes="36px"
                                                                transformation={[{ quality: 60, format: 'auto' }]}
                                                                loading="lazy"
                                                            />
                                                        ) : (
                                                            <DefaultCover className="w-full h-full" size="small" />
                                                        )}
                                                    </span>

                                                    <span className="flex-1 min-w-0">
                                                        <span className="block text-sm font-medium text-fg truncate">{title}</span>
                                                        <span className="block text-[11px] text-fg-subtle">
                                                            {[
                                                                formatMediaFormat(d.media.format),
                                                                d.media.startDate?.year,
                                                                `${d.relationType === 'SEQUEL' ? 'Sequel' : 'Prequel'}${d.depth > 1 ? ` · depth ${d.depth}` : ''}`,
                                                            ].filter(Boolean).join(' · ')}
                                                        </span>
                                                    </span>

                                                    {unfinished && (
                                                        <span
                                                            className="flex-shrink-0"
                                                            title={d.media.status === 'RELEASING' ? 'Still airing' : 'Not yet released'}
                                                        >
                                                            <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                                                        </span>
                                                    )}

                                                    <span className="flex-shrink-0">{statusBadge(d)}</span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                )
                            )}

                            {phase === 'applying' && (
                                <div className="py-8 space-y-3">
                                    <p className="text-sm font-medium text-fg text-center tabular-nums">
                                        Adding {applyProgress.current}/{applyProgress.total}…
                                    </p>
                                    <ProgressBar value={applyProgress.current} max={applyProgress.total} />
                                    {applyProgress.failed > 0 && (
                                        <p className="text-xs text-danger text-center tabular-nums">
                                            {applyProgress.failed} failed
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        {phase === 'review' && (
                            <div className="p-4 border-t border-edge space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    {isAnime ? (
                                        <label className="flex items-center gap-2 cursor-pointer text-xs text-fg-muted">
                                            <input
                                                type="checkbox"
                                                checked={includeExtraFormats}
                                                onChange={() => setIncludeExtraFormats(!includeExtraFormats)}
                                                className="checkbox"
                                            />
                                            Include specials, OVAs, ONAs & music
                                        </label>
                                    ) : <span />}

                                    <div className="flex items-center gap-2">
                                        <label className="text-xs text-fg-muted">Set status</label>
                                        <select
                                            value={targetStatus}
                                            onChange={(e) => setTargetStatus(e.target.value as MediaListStatus)}
                                            className="select h-8 w-40 text-xs"
                                        >
                                            {Object.values(MediaListStatus).map(status => (
                                                <option key={status} value={status}>
                                                    {getStatusLabel(status, currentType)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2">
                                    <button onClick={onClose} className="btn-secondary h-9 text-sm">
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleApply}
                                        disabled={selectedCount === 0}
                                        className="btn-primary h-9 text-sm"
                                    >
                                        Add {selectedCount} as {getStatusLabel(targetStatus, currentType)}
                                    </button>
                                </div>
                            </div>
                        )}
                    </m.div>
                </m.div>
            )}
        </AnimatePresence>
    )
}
