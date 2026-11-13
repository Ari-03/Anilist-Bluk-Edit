import { afterEach, describe, expect, test } from 'bun:test'
import { AniListClient } from './anilist'

const realFetch = globalThis.fetch
afterEach(() => {
    globalThis.fetch = realFetch
})

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('AniListClient', () => {
    test('a reply whose body times out mid-read is retried like any timeout', async () => {
        let calls = 0
        globalThis.fetch = (async () => {
            calls++
            if (calls === 1) {
                // Headers arrived, then the body stalled past the request timeout
                const stalled = json({})
                stalled.text = () => Promise.reject(new DOMException('signal timed out', 'TimeoutError'))
                return stalled
            }
            return json({ data: { Viewer: { id: 1, name: 'Tester' } } })
        }) as typeof fetch

        const user = await new AniListClient('token').getCurrentUser()
        expect(user.id).toBe(1)
        expect(calls).toBe(2)
    })

    test('deleting an entry that is already gone counts as deleted', async () => {
        globalThis.fetch = (async () =>
            json({ data: null, errors: [{ message: 'validation', status: 400, validation: { id: ['The selected id is invalid.'] } }] }, 400)
        ) as typeof fetch

        expect(await new AniListClient('token').deleteMediaListEntry(5)).toEqual({ deleted: true })
    })
})
