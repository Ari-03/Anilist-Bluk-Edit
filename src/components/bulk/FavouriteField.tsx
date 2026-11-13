import { Heart, HeartOff } from 'lucide-react'
import { FavouriteAction } from '@/lib/favourites'
import { cn } from '@/lib/utils'

interface FavouriteFieldProps {
    id: string
    value: FavouriteAction
    onChange: (value: FavouriteAction) => void
    disabled?: boolean
}

/**
 * Bulk favourite (the heart on anilist.co) as a grid select with a leading
 * heart; option labels stay short so the column fits at phone width.
 */
export default function FavouriteField({ id, value, onChange, disabled }: FavouriteFieldProps) {
    const Icon = value === 'remove' ? HeartOff : Heart
    return (
        <div>
            <label htmlFor={id} className="block text-xs font-medium text-fg-muted mb-1">Favourite</label>
            <div className="relative">
                <Icon
                    aria-hidden
                    className={cn(
                        'pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4',
                        value === 'add' ? 'text-danger fill-current' : value === 'remove' ? 'text-fg-muted' : 'text-fg-subtle'
                    )}
                />
                <select
                    id={id}
                    value={value ?? ''}
                    onChange={(e) => onChange((e.target.value || null) as FavouriteAction)}
                    title="The heart on anilist.co, shared by anime and manga"
                    className={cn(
                        'select h-9 text-sm pl-8',
                        value === 'add' && 'border-danger/40 bg-danger/10',
                        value === 'remove' && 'bg-raised'
                    )}
                    disabled={disabled}
                >
                    <option value="">No change</option>
                    <option value="add">Add</option>
                    <option value="remove">Remove</option>
                </select>
            </div>
        </div>
    )
}
