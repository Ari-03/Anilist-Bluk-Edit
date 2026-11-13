/**
 * Cover size (Settings): the narrowest a grid cover may be, in pixels. The
 * grid fits as many columns of at least this width as it has room for, so a
 * smaller value means more, smaller covers. Applied as `--cover-min` on <html>
 * (also before paint in public/theme.js; coverSize.test.ts keeps the bounds in step).
 */
export const COVER_SIZE = { min: 100, max: 240, step: 20, default: 160 } as const

/** The size in words, for the Settings readout and screen readers */
export const coverSizeLabel = (size: number): string => (size <= 120 ? 'Small' : size <= 180 ? 'Medium' : 'Large')

/** A saved cover size snapped onto the slider's stops, or the default when it is missing or invalid */
export function parseCoverSize(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return COVER_SIZE.default
    const { min, max, step } = COVER_SIZE
    return Math.min(max, Math.max(min, min + Math.round((value - min) / step) * step))
}
