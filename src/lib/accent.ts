/**
 * Accent colours the user can pick in Settings. The accent tints the logo and
 * everything that acts on the selection (the Bulk edit button, selection
 * outlines, Edit and Apply). Each id has a `[data-accent='…']` block in
 * globals.css holding its colour values, and public/theme.js applies the saved
 * id before first paint; accent.test.ts keeps the three in step.
 */
export const ACCENT_COLORS = [
    { id: 'purple', label: 'Purple' },
    { id: 'blue', label: 'Blue' },
    { id: 'teal', label: 'Teal' },
    { id: 'green', label: 'Green' },
    { id: 'pink', label: 'Pink' },
    { id: 'orange', label: 'Orange' },
] as const

export type AccentColor = (typeof ACCENT_COLORS)[number]['id']

export const DEFAULT_ACCENT: AccentColor = 'purple'

/** A saved accent id, or the default when it is missing or no longer offered */
export const parseAccent = (value: unknown): AccentColor =>
    ACCENT_COLORS.find(accent => accent.id === value)?.id ?? DEFAULT_ACCENT
