import { useState } from 'react'
import { useStore } from '@/store'
import { MediaType } from '@/types/anilist'
import { cn } from '@/lib/utils'
import { Plus, Minus, RotateCcw, ListPlus } from 'lucide-react'

interface CustomListsFieldProps {
    availableCustomLists: string[]
    value: Record<string, 'add' | 'remove' | null>
    onChange: (value: Record<string, 'add' | 'remove' | null>) => void
    currentType: MediaType
    disabled?: boolean
}

/**
 * Tri-state chips: neutral (no change) → add → remove.
 * AniList keeps separate custom lists per media type, so the header names the
 * type and a refresh affordance pulls newly created lists without re-login.
 */
export default function CustomListsField({
    availableCustomLists,
    value,
    onChange,
    currentType,
    disabled,
}: CustomListsFieldProps) {
    const refreshUser = useStore(s => s.refreshUser)
    const [refreshing, setRefreshing] = useState(false)

    const typeLabel = currentType === MediaType.ANIME ? 'Anime' : 'Manga'

    const handleRefresh = async () => {
        setRefreshing(true)
        try {
            await refreshUser()
        } finally {
            setRefreshing(false)
        }
    }

    const cycle = (listName: string) => {
        const current = value[listName] || null
        const next: 'add' | 'remove' | null = current === null ? 'add' : current === 'add' ? 'remove' : null
        onChange({ ...value, [listName]: next })
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <div>
                    <h5 className="text-sm font-semibold text-fg">Custom Lists · {typeLabel}</h5>
                    <p className="text-xs text-fg-subtle">
                        AniList keeps separate custom lists for anime and manga
                    </p>
                </div>
                <button
                    type="button"
                    onClick={handleRefresh}
                    disabled={refreshing || disabled}
                    className="btn-icon w-8 h-8"
                    title="Refresh list names from AniList"
                >
                    <RotateCcw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
                </button>
            </div>

            {availableCustomLists.length === 0 ? (
                <div className="rounded-lg border border-dashed border-edge p-4 text-center">
                    <ListPlus className="w-5 h-5 text-fg-subtle mx-auto mb-1.5" />
                    <p className="text-xs text-fg-muted">
                        No {typeLabel.toLowerCase()} custom lists yet. Create them in your{' '}
                        <a
                            href="https://anilist.co/settings/lists"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent hover:underline"
                        >
                            AniList settings
                        </a>
                        , then hit refresh.
                    </p>
                </div>
            ) : (
                <>
                    <div className="flex flex-wrap gap-2">
                        {availableCustomLists.map(listName => {
                            const state = value[listName] || null
                            return (
                                <button
                                    key={listName}
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => cycle(listName)}
                                    className={cn(
                                        'inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-medium transition-all duration-150 disabled:opacity-50',
                                        state === null && 'border-edge text-fg-muted hover:border-fg-subtle hover:text-fg',
                                        state === 'add' && 'border-success/40 bg-success/10 text-success',
                                        state === 'remove' && 'border-danger/40 bg-danger/10 text-danger line-through'
                                    )}
                                >
                                    {state === 'add' && <Plus className="w-3 h-3" strokeWidth={3} />}
                                    {state === 'remove' && <Minus className="w-3 h-3" strokeWidth={3} />}
                                    {listName}
                                </button>
                            )
                        })}
                    </div>
                    <p className="text-[11px] text-fg-subtle mt-2">
                        Tap to cycle: no change → add to list → remove from list
                    </p>
                </>
            )}
        </div>
    )
}
