import { describe, expect, test } from 'bun:test'
import { parseEditInput } from './scoreFormat'
import { applyCustomListChanges } from './customLists'

describe('parseEditInput', () => {
    test('empty fields mean no change', () => {
        expect(parseEditInput('', '', 'POINT_10')).toEqual({ ok: true, score: undefined, progress: undefined })
        expect(parseEditInput('  ', ' ', 'POINT_10')).toEqual({ ok: true, score: undefined, progress: undefined })
    })

    test('POINT_10_DECIMAL accepts one decimal place and rejects two', () => {
        expect(parseEditInput('8.5', '', 'POINT_10_DECIMAL')).toMatchObject({ ok: true, score: 8.5 })
        expect(parseEditInput('8,5', '', 'POINT_10_DECIMAL')).toMatchObject({ ok: true, score: 8.5 })
        expect(parseEditInput('8.55', '', 'POINT_10_DECIMAL')).toMatchObject({ ok: false, field: 'score' })
    })

    test('whole-number formats reject fractions and out-of-range values', () => {
        expect(parseEditInput('7', '', 'POINT_10')).toMatchObject({ ok: true, score: 7 })
        expect(parseEditInput('7.5', '', 'POINT_10')).toMatchObject({ ok: false, field: 'score' })
        expect(parseEditInput('6', '', 'POINT_5')).toMatchObject({ ok: false, field: 'score' })
        expect(parseEditInput('100', '', 'POINT_100')).toMatchObject({ ok: true, score: 100 })
        expect(parseEditInput('101', '', 'POINT_100')).toMatchObject({ ok: false, field: 'score' })
        expect(parseEditInput('-1', '', 'POINT_3')).toMatchObject({ ok: false, field: 'score' })
    })

    test('garbage score text is rejected rather than sent as null', () => {
        expect(parseEditInput('abc', '', 'POINT_10')).toMatchObject({ ok: false, field: 'score' })
    })

    test('progress must be a whole non-negative number', () => {
        expect(parseEditInput('', '12', 'POINT_10')).toMatchObject({ ok: true, progress: 12 })
        expect(parseEditInput('', '0', 'POINT_10')).toMatchObject({ ok: true, progress: 0 })
        expect(parseEditInput('', '1.5', 'POINT_10')).toMatchObject({ ok: false, field: 'progress' })
        expect(parseEditInput('', '-3', 'POINT_10')).toMatchObject({ ok: false, field: 'progress' })
        expect(parseEditInput('', 'x', 'POINT_10')).toMatchObject({ ok: false, field: 'progress' })
    })

    test('score is validated before progress', () => {
        expect(parseEditInput('99', 'x', 'POINT_10')).toMatchObject({ ok: false, field: 'score' })
    })
})

describe('applyCustomListChanges', () => {
    test('adds, removes, and keeps untouched lists', () => {
        const result = applyCustomListChanges(
            { Favorites: true, Rewatch: true, Dropped: false },
            { Rewatch: 'remove', Backlog: 'add', Favorites: null }
        )
        expect(result.sort()).toEqual(['Backlog', 'Favorites'])
    })

    test('adding an existing list does not duplicate it', () => {
        expect(applyCustomListChanges({ Favorites: true }, { Favorites: 'add' })).toEqual(['Favorites'])
    })

    test('undefined membership is treated as empty', () => {
        expect(applyCustomListChanges(undefined, { Backlog: 'add' })).toEqual(['Backlog'])
    })
})
