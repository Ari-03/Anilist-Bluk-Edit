import { Heart } from 'lucide-react'
import { FavouriteAction } from '@/lib/favourites'
import { cn } from '@/lib/utils'

interface FavouriteFieldProps {
    value: FavouriteAction
    onChange: (value: FavouriteAction) => void
    disabled?: boolean
}

const NEXT: Record<'none' | 'add' | 'remove', FavouriteAction> = { none: 'add', add: 'remove', remove: null }
const LABEL = { none: 'Favourite', add: 'Add to favourites', remove: 'Remove from favourites' } as const

/** Bulk favourite toggle; cycles like the custom-list chips: no change → add → remove */
export default function FavouriteField({ value, onChange, disabled }: FavouriteFieldProps) {
    const state = value ?? 'none'
    return (
        <div>
            <h5 className="text-sm font-semibold text-fg flex items-center gap-1.5">
                <Heart className="w-4 h-4 text-danger fill-current" aria-hidden />
                Favourites
            </h5>
            <p className="text-xs text-fg-subtle mb-2">The heart on anilist.co, shared by anime and manga</p>
            <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(NEXT[state])}
                aria-label={`Favourite: ${state === 'add' ? 'will be added' : state === 'remove' ? 'will be removed' : 'no change'}`}
                className={cn(
                    'inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-medium transition-all duration-150 disabled:opacity-50',
                    state === 'none' && 'border-edge text-fg-muted hover:border-fg-subtle hover:text-fg',
                    state === 'add' && 'border-danger/40 bg-danger/10 text-danger',
                    state === 'remove' && 'border-edge-strong bg-raised text-fg-muted line-through'
                )}
            >
                <Heart className={cn('w-3.5 h-3.5', state === 'add' && 'fill-current')} aria-hidden />
                {LABEL[state]}
            </button>
        </div>
    )
}
