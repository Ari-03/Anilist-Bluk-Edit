import * as Popover from '@radix-ui/react-popover'
import { Check, Settings } from 'lucide-react'
import { useStore } from '@/store'
import { ACCENT_COLORS } from '@/lib/accent'

/**
 * Header popover for app preferences. Holds the accent colour, which tints
 * the logo and the bulk edit controls; picking one applies it at once and
 * the choice is saved in this browser.
 */
export default function SettingsMenu() {
    const accentColor = useStore(s => s.accentColor)
    const setAccentColor = useStore(s => s.setAccentColor)
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
                    className="z-popover card w-64 p-4 shadow-overlay focus:outline-none"
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
                                className="relative flex h-7 w-7 items-center justify-center rounded-full bg-tint text-white transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-tint focus-visible:ring-offset-2 focus-visible:ring-offset-surface before:absolute before:-inset-2"
                            >
                                {accentColor === id && <Check className="h-4 w-4" strokeWidth={3} />}
                            </button>
                        ))}
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    )
}
