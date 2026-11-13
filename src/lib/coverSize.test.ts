import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { COVER_SIZE, coverSizeLabel, parseCoverSize } from './coverSize'

describe('parseCoverSize', () => {
    test('keeps a size on one of the slider stops', () => {
        expect(parseCoverSize(120)).toBe(120)
        expect(parseCoverSize(COVER_SIZE.max)).toBe(COVER_SIZE.max)
    })

    test('snaps and clamps anything else', () => {
        expect(parseCoverSize(131)).toBe(140)
        expect(parseCoverSize(20)).toBe(COVER_SIZE.min)
        expect(parseCoverSize(9999)).toBe(COVER_SIZE.max)
    })

    test('falls back to the default for non-numbers', () => {
        expect(parseCoverSize(undefined)).toBe(COVER_SIZE.default)
        expect(parseCoverSize('160')).toBe(COVER_SIZE.default)
        expect(parseCoverSize(NaN)).toBe(COVER_SIZE.default)
    })
})

test('coverSizeLabel names the ends and the default', () => {
    expect(coverSizeLabel(COVER_SIZE.min)).toBe('Small')
    expect(coverSizeLabel(COVER_SIZE.default)).toBe('Medium')
    expect(coverSizeLabel(COVER_SIZE.max)).toBe('Large')
})

// theme.js applies the saved size before paint and can't import these bounds
test('theme.js clamps to the same bounds', () => {
    const themeScript = readFileSync(join(import.meta.dir, '../../public/theme.js'), 'utf8')
    expect(themeScript).toContain(`>= ${COVER_SIZE.min}`)
    expect(themeScript).toContain(`<= ${COVER_SIZE.max}`)
})
