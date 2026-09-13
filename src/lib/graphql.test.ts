import { describe, expect, test } from 'bun:test'
import { splitAliases } from './graphql'

describe('splitAliases', () => {
    test('clean response: every alias succeeds in input order', () => {
        const results = splitAliases({ data: { e0: { id: 1 }, e1: { id: 2 } } }, ['e0', 'e1'])
        expect(results).toEqual([
            { alias: 'e0', ok: true, data: { id: 1 } },
            { alias: 'e1', ok: true, data: { id: 2 } },
        ])
    })

    test('null alias with a pathed error gets that error', () => {
        const results = splitAliases(
            {
                data: { e0: { id: 1 }, e1: null },
                errors: [{ message: 'Invalid custom list', status: 400, path: ['e1'] }],
            },
            ['e0', 'e1']
        )
        expect(results[0]).toMatchObject({ ok: true })
        expect(results[1]).toEqual({ alias: 'e1', ok: false, message: 'Invalid custom list' })
    })

    test('null alias without a pathed error falls back to the first error', () => {
        const results = splitAliases(
            { data: { e0: null, e1: { id: 2 } }, errors: [{ message: 'Something broke' }] },
            ['e0', 'e1']
        )
        expect(results[0]).toEqual({ alias: 'e0', ok: false, message: 'Something broke' })
        expect(results[1]).toMatchObject({ ok: true })
    })

    test('missing alias with no errors at all gets a generic message', () => {
        const results = splitAliases({ data: {} }, ['e0'])
        expect(results[0].ok).toBe(false)
        if (!results[0].ok) expect(results[0].message).toContain('no result')
    })

    test('all-null data still yields one failure per alias', () => {
        const results = splitAliases({ data: null, errors: [{ message: 'Too Many Requests', status: 429 }] }, ['a', 'b'])
        expect(results.map(r => r.ok)).toEqual([false, false])
    })
})
