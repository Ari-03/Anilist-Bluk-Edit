import { MediaList } from '@/types/anilist'

export type FavouriteAction = 'add' | 'remove' | null

/**
 * Splits a bulk favourite change into what must be sent. AniList's
 * ToggleFavourite only flips the current state, so entries already in the
 * target state are done without a request, and titles AniList blocks from
 * favourites can't be added at all.
 */
export function planFavourites(entries: MediaList[], action: Exclude<FavouriteAction, null>) {
    const target = action === 'add'
    const toToggle: MediaList[] = []
    const alreadyDone: MediaList[] = []
    const blocked: MediaList[] = []
    for (const entry of entries) {
        if (!!entry.media?.isFavourite === target) alreadyDone.push(entry)
        else if (target && entry.media?.isFavouriteBlocked) blocked.push(entry)
        else toToggle.push(entry)
    }
    return { target, toToggle, alreadyDone, blocked }
}
