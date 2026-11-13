import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ACCENT_COLORS, DEFAULT_ACCENT, parseAccent } from './accent'

const read = (path: string) => readFileSync(join(import.meta.dir, '../..', path), 'utf8')

describe('parseAccent', () => {
    test('keeps an accent that is offered', () => {
        expect(parseAccent('teal')).toBe('teal')
    })

    test('falls back to the default for anything else', () => {
        expect(parseAccent('chartreuse')).toBe(DEFAULT_ACCENT)
        expect(parseAccent(undefined)).toBe(DEFAULT_ACCENT)
        expect(parseAccent(7)).toBe(DEFAULT_ACCENT)
    })
})

// The ids live in three places that can't import each other
describe('accent ids stay in step', () => {
    const css = read('src/styles/globals.css')
    const themeScript = read('public/theme.js')

    for (const { id } of ACCENT_COLORS) {
        test(`${id} has colour values in globals.css`, () => {
            expect(css).toContain(`[data-accent='${id}']`)
        })

        test(`${id} is applied before paint by theme.js`, () => {
            expect(themeScript).toContain(`'${id}'`)
        })
    }
})
