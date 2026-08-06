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
