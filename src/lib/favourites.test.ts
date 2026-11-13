import { describe, expect, test } from 'bun:test'
import { planFavourites } from './favourites'
import { MediaList } from '@/types/anilist'

const entry = (id: number, media: { isFavourite?: boolean; isFavouriteBlocked?: boolean }) =>
    ({ id, mediaId: id, media: { id, ...media } }) as unknown as MediaList

describe('planFavourites', () => {
    const entries = [
        entry(1, { isFavourite: true }),
        entry(2, { isFavourite: false }),
        entry(3, {}),
        entry(4, { isFavourite: false, isFavouriteBlocked: true }),
    ]
    const ids = (list: MediaList[]) => list.map(e => e.id)

    test('add toggles only entries that are not favourites yet, and skips blocked titles', () => {
        const plan = planFavourites(entries, 'add')
        expect(ids(plan.toToggle)).toEqual([2, 3])
        expect(ids(plan.alreadyDone)).toEqual([1])
        expect(ids(plan.blocked)).toEqual([4])
    })

    test('remove toggles only current favourites', () => {
        const plan = planFavourites(entries, 'remove')
        expect(ids(plan.toToggle)).toEqual([1])
        expect(ids(plan.alreadyDone)).toEqual([2, 3, 4])
        expect(plan.blocked).toEqual([])
    })
})
