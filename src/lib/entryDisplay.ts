import { MediaList } from '@/types/anilist'

export const formatProgress = (entry: MediaList): string => {
    const current = entry.progress || 0
    const max = entry.media?.episodes || entry.media?.chapters
    return max ? `${current}/${max}` : current.toString()
}

export const hasScore = (entry: MediaList): boolean =>
    entry.score !== null && entry.score !== undefined && entry.score > 0

export const formatScore = (entry: MediaList): string =>
    hasScore(entry) ? String(entry.score) : '–'

/** Percent watched/read (0–100), or null when total count is unknown */
export const progressPercent = (entry: MediaList): number | null => {
    const max = entry.media?.episodes || entry.media?.chapters
    if (!max) return null
    return Math.min(100, ((entry.progress || 0) / max) * 100)
}

const FORMAT_LABELS: Record<string, string> = {
    TV: 'TV',
    TV_SHORT: 'TV Short',
    MOVIE: 'Movie',
    SPECIAL: 'Special',
    OVA: 'OVA',
    ONA: 'ONA',
    MUSIC: 'Music',
    MANGA: 'Manga',
    NOVEL: 'Novel',
    ONE_SHOT: 'One Shot',
}

export const formatMediaFormat = (format?: string): string =>
    format ? (FORMAT_LABELS[format] ?? format) : ''
