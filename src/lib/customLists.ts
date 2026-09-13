export type CustomListAction = 'add' | 'remove' | null

/**
 * Apply bulk add/remove actions to an entry's custom-list membership.
 * AniList's SaveMediaListEntry replaces the whole membership with the array
 * it receives, so the result must always be the complete list, never a delta.
 */
export function applyCustomListChanges(
    current: Record<string, boolean> | undefined,
    changes: Record<string, CustomListAction>
): string[] {
    const enabled = Object.entries(current ?? {})
        .filter(([, on]) => on)
        .map(([name]) => name)
    const kept = enabled.filter(name => changes[name] !== 'remove')
    const added = Object.entries(changes)
        .filter(([, action]) => action === 'add')
        .map(([name]) => name)
    return Array.from(new Set([...kept, ...added]))
}
