import { afterEach, describe, expect, test } from 'bun:test'
import { AniListClient } from './anilist'
import { MediaType } from '@/types/anilist'

const realFetch = globalThis.fetch
afterEach(() => {
    globalThis.fetch = realFetch
})

const stubFetch = (fn: () => Promise<Response>) => {
    globalThis.fetch = Object.assign(fn, { preconnect: realFetch.preconnect })
}

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('AniListClient', () => {
    test('a reply whose body times out mid-read is retried like any timeout', async () => {
        let calls = 0
        stubFetch(async () => {
            calls++
            if (calls === 1) {
                // Headers arrived, then the body stalled past the request timeout
                const stalled = json({})
                stalled.text = () => Promise.reject(new DOMException('signal timed out', 'TimeoutError'))
                return stalled
            }
            return json({ data: { Viewer: { id: 1, name: 'Tester' } } })
        })

        const user = await new AniListClient('token').getCurrentUser()
        expect(user.id).toBe(1)
        expect(calls).toBe(2)
    })

    test('deleting an entry that is already gone counts as deleted', async () => {
        stubFetch(async () =>
            json({ data: null, errors: [{ message: 'validation', status: 400, validation: { id: ['The selected id is invalid.'] } }] }, 400)
        )

        expect(await new AniListClient('token').deleteMediaListEntry(5)).toEqual({ deleted: true })
    })

    // Keep last: the failure puts the shared pacer into its 61 s back-off
    test('favourite toggles are never re-sent after a network failure', async () => {
        let calls = 0
        stubFetch(async () => {
            calls++
            throw new TypeError('Failed to fetch')
        })
        const toggling = new AniListClient('token').toggleFavourites([{ id: 1, type: MediaType.ANIME }])
        expect(await toggling.then(() => 'sent', () => 'failed')).toBe('failed')
        expect(calls).toBe(1)
    })
})
