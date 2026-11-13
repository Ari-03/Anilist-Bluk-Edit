import { Component, createRef, ReactNode } from 'react'

interface ListMotionProps {
    /** A new value means the list's contents or order changed (the filtered entries array) */
    entries: unknown
    /**
     * Identifies the layout the entries are drawn in. When it changes (grid to
     * list, anime to manga) nothing lines up with what was there, so entries
     * fade in rather than fly across the screen.
     */
    layoutKey: string
    className?: string
    children: ReactNode
}

interface Placed {
    element: HTMLElement
    rect: DOMRect
}

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
const FADE_MS = 160
/** A whole new list (first load, grid to list, anime to manga) fades in one entry after another, up to this many steps */
const STAGGER_STEPS = 8
const STAGGER_MS = 12
/** No glide travels further than this, however large the entries are */
const MAX_GLIDE_PX = 480

/** Where each entry that is on screen right now sits, keyed by entry id */
function measureOnScreen(root: HTMLElement | null): Map<string, Placed> {
    const placed = new Map<string, Placed>()
    if (!root) return placed
    const viewportHeight = window.innerHeight
    root.querySelectorAll<HTMLElement>('[data-entry-id]').forEach(element => {
        const rect = element.getBoundingClientRect()
        if (rect.bottom > 0 && rect.top < viewportHeight) placed.set(element.dataset.entryId!, { element, rect })
    })
    return placed
}

/** Positions closer than this count as the same (sub-pixel layout differences) */
const SAME_PX = 1

/**
 * Whether an entry should glide from `was` to `now`. A glide runs along one
 * row or one column, and only a couple of entries far: a row closing up, an
 * entry dropping to the row below. Diagonal and long trips would pass over
 * other entries, and a trip that starts outside the entry's own section would
 * be clipped at the section's edge. Those fade in at their destination instead.
 */
function shouldGlide(element: HTMLElement, was: DOMRect, now: DOMRect): boolean {
    const dx = Math.abs(was.left - now.left)
    const dy = Math.abs(was.top - now.top)
    if (dx >= SAME_PX && dy >= SAME_PX) return false
    const reach = Math.min(MAX_GLIDE_PX, 2.5 * (dx >= SAME_PX ? now.width : now.height))
    if (dx + dy > reach) return false
    const section = element.closest('section')?.getBoundingClientRect()
    return !section || (was.top >= section.top && was.bottom <= section.bottom)
}

/**
 * Animates the list when it changes: entries that stay nearby glide from where
 * they were to where they now are, and entries that are new to the screen, or
 * came from far away, fade in. Entries that leave simply go. Children mark
 * each entry's outer element with `data-entry-id`.
 *
 * Only entries on screen are animated, so a library of 5,000 animates no more
 * than a screenful. The entries keep their place in the page, so they pass
 * under sticky headers and open menus as usual.
 *
 * A class because getSnapshotBeforeUpdate is the one React hook point that
 * sees the DOM after a render but before its changes are applied, which is
 * when the "before" positions have to be read.
 */
export default class ListMotion extends Component<ListMotionProps> {
    private root = createRef<HTMLDivElement>()

    componentDidMount() {
        this.play(new Map())
    }

    getSnapshotBeforeUpdate(previous: ListMotionProps): Map<string, Placed> | null {
        if (previous.entries === this.props.entries && previous.layoutKey === this.props.layoutKey) return null
        return previous.layoutKey === this.props.layoutKey ? measureOnScreen(this.root.current) : new Map()
    }

    componentDidUpdate(_previous: ListMotionProps, _state: unknown, before: Map<string, Placed> | null) {
        if (before) this.play(before)
    }

    private play(before: Map<string, Placed>) {
        const root = this.root.current
        if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

        // A change can land mid-flight. `before` already holds the in-flight positions;
        // stop the glides so the positions measured next are the resting ones. Fades
        // don't move anything, so they carry on.
        root.getAnimations({ subtree: true }).forEach(animation => {
            if (animation.id === 'list-move') animation.cancel()
        })

        // Stagger only a whole new list. While filtering, newcomers fade in together
        // so the list settles as fast as the entries that stayed
        const stagger = before.size === 0
        let entering = 0
        measureOnScreen(root).forEach(({ element, rect }, id) => {
            const was = before.get(id)?.rect
            if (was && Math.abs(was.left - rect.left) < SAME_PX && Math.abs(was.top - rect.top) < SAME_PX) return

            if (was && shouldGlide(element, was, rect)) {
                const dx = was.left - rect.left
                const dy = was.top - rect.top
                // z-index keeps a moving entry above the ones it passes
                element.animate(
                    [{ transform: `translate(${dx}px, ${dy}px)`, zIndex: 1 }, { transform: 'none', zIndex: 1 }],
                    { id: 'list-move', duration: 220 + Math.hypot(dx, dy) * 0.1, easing: EASE }
                )
            } else {
                // An entry that was already on screen is familiar, so it settles in from
                // part-way rather than blinking out and back
                element.animate([{ opacity: was ? 0.4 : 0 }, { opacity: 1 }], {
                    id: 'list-enter',
                    duration: FADE_MS,
                    easing: EASE,
                    fill: 'backwards',
                    delay: stagger ? Math.min(entering++, STAGGER_STEPS) * STAGGER_MS : 0,
                })
            }
        })
    }

    render() {
        return (
            <div ref={this.root} className={this.props.className}>
                {this.props.children}
            </div>
        )
    }
}
