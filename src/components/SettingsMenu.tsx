import * as Popover from '@radix-ui/react-popover'
import { Check, Grid2X2, Grid3X3, Settings } from 'lucide-react'
import { useStore } from '@/store'
import { ACCENT_COLORS } from '@/lib/accent'
import { COVER_SIZE, coverSizeLabel } from '@/lib/coverSize'

/**
 * Header popover for app preferences: the accent colour, which tints the logo
 * and the bulk edit controls, and the cover size of the grid. Each applies as
 * it is changed and is saved in this browser.
 */
export default function SettingsMenu() {
    const accentColor = useStore(s => s.accentColor)
    const setAccentColor = useStore(s => s.setAccentColor)
    const coverSize = useStore(s => s.coverSize)
    const setCoverSize = useStore(s => s.setCoverSize)
    const viewMode = useStore(s => s.viewMode)
    const current = ACCENT_COLORS.find(accent => accent.id === accentColor)

    return (
        <Popover.Root>
            <Popover.Trigger asChild>
                <button className="btn-icon" title="Settings">
                    <Settings className="w-[18px] h-[18px]" />
                </button>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    align="end"
                    sideOffset={8}
                    collisionPadding={8}
                    aria-label="Settings"
                    className="z-popover card w-72 p-4 shadow-overlay focus:outline-none"
                >
                    <h2 className="text-sm font-semibold text-fg">Settings</h2>
                    <div className="mt-3 flex items-baseline justify-between">
                        <span id="accent-label" className="text-xs font-medium text-fg-muted">Accent colour</span>
                        <span className="text-xs text-fg-subtle">{current?.label}</span>
                    </div>
                    <div role="radiogroup" aria-labelledby="accent-label" className="mt-2 flex justify-between">
                        {ACCENT_COLORS.map(({ id, label }) => (
                            // data-accent scopes that accent's colour values to the swatch itself
                            <button
                                key={id}
                                data-accent={id}
                                role="radio"
                                aria-checked={accentColor === id}
                                aria-label={label}
                                title={label}
                                onClick={() => setAccentColor(id)}
                                // 32px swatch plus a 6px ::before margin: 44px targets that stop short of the
                                // neighbours, whose centres sit just over 44px apart in this row
                                className="relative flex h-8 w-8 items-center justify-center rounded-full bg-tint text-white transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-tint focus-visible:ring-offset-2 focus-visible:ring-offset-surface before:absolute before:-inset-1.5"
                            >
                                {accentColor === id && <Check className="h-4 w-4" strokeWidth={3} />}
                            </button>
                        ))}
                    </div>

                    <div className="mt-4 flex items-baseline justify-between">
                        <label htmlFor="cover-size" className="text-xs font-medium text-fg-muted">Cover size</label>
                        <span className="text-xs text-fg-subtle">{coverSizeLabel(coverSize)}</span>
                    </div>
                    {/* Smaller covers on the left, so more fit per row; the grid resizes as the slider moves */}
                    <div className="mt-1 flex items-center gap-2.5 text-fg-subtle">
                        <Grid3X3 className="h-4 w-4 flex-shrink-0" aria-hidden />
                        <input
                            id="cover-size"
                            type="range"
                            min={COVER_SIZE.min}
                            max={COVER_SIZE.max}
                            step={COVER_SIZE.step}
                            value={coverSize}
                            onChange={(e) => setCoverSize(Number(e.target.value))}
                            aria-valuetext={coverSizeLabel(coverSize)}
                            className="h-6 touch:h-11 w-full cursor-pointer [accent-color:rgb(var(--c-tint))]"
                        />
                        <Grid2X2 className="h-4 w-4 flex-shrink-0" aria-hidden />
                    </div>
                    {viewMode === 'list' && <p className="mt-1 text-xs text-fg-subtle">Applies in grid view.</p>}
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    )
}
