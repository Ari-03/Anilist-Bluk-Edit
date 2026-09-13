import { ScoreFormat } from '@/types/anilist'

export interface ScoreRange {
    min: number
    max: number
    step: number
}

export function getScoreRange(scoreFormat?: ScoreFormat | string): ScoreRange {
    switch (scoreFormat) {
        case 'POINT_100':
            return { min: 0, max: 100, step: 1 }
        case 'POINT_10_DECIMAL':
            return { min: 0, max: 10, step: 0.1 }
        case 'POINT_10':
            return { min: 0, max: 10, step: 1 }
        case 'POINT_5':
            return { min: 0, max: 5, step: 1 }
        case 'POINT_3':
            return { min: 0, max: 3, step: 1 }
        default:
            return { min: 0, max: 10, step: 1 }
    }
}

export type ParsedEdit =
    | { ok: true; score?: number; progress?: number }
    | { ok: false; field: 'score' | 'progress'; message: string }

/**
 * Parse the score and progress text fields of an edit form. Empty text means
 * "no change". Score must fit the user's scoring format (range and step);
 * progress must be a whole, non-negative number. Mirrors the iOS BulkEditInput.
 */
export function parseEditInput(
    scoreText: string,
    progressText: string,
    scoreFormat?: ScoreFormat | string
): ParsedEdit {
    const { max, step } = getScoreRange(scoreFormat)
    const scoreRaw = scoreText.trim().replace(',', '.')
    const progressRaw = progressText.trim()

    let score: number | undefined
    if (scoreRaw !== '') {
        score = Number(scoreRaw)
        const onStep = Math.abs(score / step - Math.round(score / step)) < 1e-6
        if (!Number.isFinite(score) || score < 0 || score > max || !onStep) {
            return { ok: false, field: 'score', message: `Score must be between 0 and ${max}${step < 1 ? ` in steps of ${step}` : ', whole numbers only'}` }
        }
    }

    let progress: number | undefined
    if (progressRaw !== '') {
        progress = Number(progressRaw)
        if (!Number.isInteger(progress) || progress < 0) {
            return { ok: false, field: 'progress', message: 'Progress must be a whole number of 0 or more' }
        }
    }

    return { ok: true, score, progress }
}
