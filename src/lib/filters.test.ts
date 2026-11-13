import { describe, expect, test } from 'bun:test'
import { MediaListStatus, MediaType } from '@/types/anilist'
import { activeFilterCount, SORT_OPTIONS } from './filters'
import { notableFormat } from './entryDisplay'

describe('activeFilterCount', () => {
    test('is zero with only sort and search set', () => {
        expect(activeFilterCount({ sortBy: 'title', sortOrder: 'asc', search: 'bleach' })).toBe(0)
    })

    test('counts each value, and a range once', () => {
        expect(
            activeFilterCount({
                status: [MediaListStatus.CURRENT, MediaListStatus.PAUSED],
                genre: ['Action'],
                year: { start: 2010, end: 2020 },
                score: { min: 7 },
            })
        ).toBe(5)
    })
})

describe('SORT_OPTIONS', () => {
    test('offers every field in both directions exactly once', () => {
        const keys = SORT_OPTIONS.map(o => `${o.sortBy}:${o.sortOrder}`)
        expect(new Set(keys).size).toBe(keys.length)
        expect(keys.length).toBe(10)
    })
})

describe('notableFormat', () => {
    test('hides the format nearly every entry of the type has', () => {
        expect(notableFormat('MANGA', MediaType.MANGA)).toBe('')
        expect(notableFormat('TV', MediaType.ANIME)).toBe('')
    })

    test('labels the exceptions', () => {
        expect(notableFormat('NOVEL', MediaType.MANGA)).toBe('Novel')
        expect(notableFormat('MOVIE', MediaType.ANIME)).toBe('Movie')
        expect(notableFormat('TV', MediaType.MANGA)).toBe('TV')
    })
})
