import { Component, createRef, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ListMotionProps {
    /** A new value means the list's contents or order changed (the filtered entries array) */
    entries: unknown
    /**
     * Identifies the layout the entries are drawn in. When it changes (grid to
     * list, anime to manga) nothing lines up with what was there, so the new
     * list rises in and nothing flies across the screen.
     */
    layoutKey: string
    className?: string
    children: ReactNode
}

interface Placed {
    element: HTMLElement
    rect: DOMRect
    /** How visible the entry was: below 1 only while one of this component's fades is running on it */
    opacity: string
}

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
/** Entries new to the screen rise this far into place */
const RISE_PX = 44
const RISE_MS = 260
/** Entries arriving together rise one after another, top to bottom, up to this many steps */
const RISE_STAGGER_STEPS = 12
const RISE_STAGGER_MS = 12
/** Entries leaving the screen fade over this long, drifting this far if they are still in the list */
const LEAVE_MS = 170
const DRIFT_PX = 28
/** At most this many departing entries are kept on screen to fade out */
const MAX_GHOSTS = 60
/** Positions closer than this count as the same (sub-pixel layout differences) */
const SAME_PX = 1
/** Animations this component starts on entries; each moves its entry, so a new change stops them before measuring */
const MOTION_IDS = ['list-move', 'list-enter', 'list-out']

/** Longer trips take a little longer, so far glides don't look rushed */
const glideMs = (distance: number) => Math.min(400, 200 + distance * 0.12)

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * An element's place and visibility right now. Opacity is read here, while the
 * element is still in the page: once React removes an entry, its animations
 * can no longer be found from the list.
 */
const place = (element: HTMLElement): Placed => ({
    element,
    rect: element.getBoundingClientRect(),
    opacity: element.getAnimations().length > 0 ? getComputedStyle(element).opacity : '1',
})

/**
 * Where each entry that is on screen right now sits, keyed by entry id.
 *
 * Entries are laid out top to bottom in document order, so a binary search
 * finds the first one that reaches the viewport and the scan stops at the
 * first one below it. That keeps the work to a screenful plus a few probes
 * however long the list is. (A glide in flight can sit a little out of order;
 * at worst an entry near the viewport's edge is missed and rises in instead.)
 */
function measureOnScreen(root: HTMLElement | null): Map<string, Placed> {
    const placed = new Map<string, Placed>()
    if (!root) return placed
    const elements = root.querySelectorAll<HTMLElement>('[data-entry-id]')
    const viewportHeight = window.innerHeight

    let first = 0
    let end = elements.length
    while (first < end) {
        const middle = (first + end) >> 1
        if (elements[middle].getBoundingClientRect().bottom > 0) end = middle
        else first = middle + 1
    }
    for (let i = first; i < elements.length; i++) {
        const placedEntry = place(elements[i])
        if (placedEntry.rect.top >= viewportHeight) break
        placed.set(elements[i].dataset.entryId!, placedEntry)
    }
    return placed
}

/**
 * Animates the list when it changes, so a search or filter reads as the same
 * entries rearranging rather than a new list popping in:
 *
 * - an entry that was on screen and still is glides to its new place;
 * - an entry that is new to the screen rises into place from below;
 * - an entry that was on screen and is gone fades out where it was (its old
 *   element is kept on screen as a ghost for the length of the fade), or, if
 *   it only moved out of view, drifts off towards where it went.
 *
 * Children mark each entry's outer element with `data-entry-id`.
 *
 * Only entries on screen are measured and animated, so a library of 5,000
 * costs no more than a screenful. Entries keep their place in the page, so
 * they pass under sticky headers and open menus as usual.
 *
 * A class because getSnapshotBeforeUpdate is the one React hook point that
 * sees the DOM after a render but before its changes are applied, which is
 * when the "before" positions have to be read.
 */
export default class ListMotion extends Component<ListMotionProps> {
    private root = createRef<HTMLDivElement>()
    private ghosts = createRef<HTMLDivElement>()
    /**
     * Entries last seen drifting out of view. They sit off screen in the layout
     * but are still visible, so the on-screen scan would not reach them.
     */
    private drifting = new Map<string, HTMLElement>()

    componentDidMount() {
        this.play(new Map())
    }

    getSnapshotBeforeUpdate(previous: ListMotionProps): Map<string, Placed> | null {
        if (previous.entries === this.props.entries && previous.layoutKey === this.props.layoutKey) return null
        if (reducedMotion()) return null
        if (previous.layoutKey !== this.props.layoutKey) return new Map()

        const placed = measureOnScreen(this.root.current)
        // Entries still fading out are on screen too, though the scan above does not find
        // them. Counting them in lets one that comes straight back carry on from where it
        // visibly is, instead of blinking out and rising in again as a second copy.
        this.drifting.forEach((element, id) => {
            const stillDrifting = element.isConnected && element.getAnimations().some(a => a.id === 'list-out')
            if (stillDrifting && !placed.has(id)) placed.set(id, place(element))
        })
        this.ghosts.current?.querySelectorAll<HTMLElement>('[data-ghost-id]').forEach(ghost => {
            const id = ghost.dataset.ghostId!
            if (!placed.has(id)) placed.set(id, place(ghost))
        })
        return placed
    }

    componentDidUpdate(_previous: ListMotionProps, _state: unknown, before: Map<string, Placed> | null) {
        if (before) this.play(before)
    }

    private play(before: Map<string, Placed>) {
        const root = this.root.current
        const ghosts = this.ghosts.current
        if (!root || !ghosts || reducedMotion()) return

        // A change can land mid-flight. `before` already holds the in-flight positions and
        // how visible each entry was, so a fade in progress carries on from there. Stop
        // what is moving so the positions measured next are the resting ones.
        root.getAnimations({ subtree: true }).forEach(animation => {
            if (MOTION_IDS.includes(animation.id)) animation.cancel()
        })
        this.drifting.clear()

        const rootRect = root.getBoundingClientRect()
        const after = measureOnScreen(root)

        let rising = 0
        after.forEach(({ element, rect }, id) => {
            const was = before.get(id)
            if (was) {
                const dx = was.rect.left - rect.left
                const dy = was.rect.top - rect.top
                const moved = Math.abs(dx) >= SAME_PX || Math.abs(dy) >= SAME_PX
                const { opacity } = was
                if (!moved && opacity === '1') return
                // z-index keeps a moving entry above the ones it passes
                element.animate(
                    [
                        { transform: `translate(${dx}px, ${dy}px)`, opacity, zIndex: 1 },
                        { transform: 'none', opacity: 1, zIndex: 1 },
                    ],
                    { id: 'list-move', duration: glideMs(Math.hypot(dx, dy)), easing: EASE }
                )
            } else {
                element.animate(
                    [{ transform: `translateY(${RISE_PX}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
                    {
                        id: 'list-enter',
                        duration: RISE_MS,
                        easing: EASE,
                        fill: 'backwards',
                        delay: Math.min(rising++, RISE_STAGGER_STEPS) * RISE_STAGGER_MS,
                    }
                )
            }
        })

        // A ghost whose entry is back has handed over to it (the entry started from the
        // ghost's place and opacity above)
        ghosts.querySelectorAll<HTMLElement>('[data-ghost-id]').forEach(ghost => {
            if (after.has(ghost.dataset.ghostId!)) ghost.remove()
        })

        let ghostCount = 0
        before.forEach(({ element, rect, opacity }, id) => {
            // Back on screen, or a ghost already fading out: nothing more to do
            if (after.has(id) || element.parentElement === ghosts) return
            if (element.isConnected) {
                this.drifting.set(id, element)
                // Still in the list, but now out of view: start where it was and drift
                // a little towards where it went while fading out
                const now = element.getBoundingClientRect()
                const dx = rect.left - now.left
                const dy = rect.top - now.top
                const length = Math.hypot(dx, dy) || 1
                element.animate(
                    [
                        { transform: `translate(${dx}px, ${dy}px)`, opacity },
                        {
                            transform: `translate(${dx - (dx / length) * DRIFT_PX}px, ${dy - (dy / length) * DRIFT_PX}px)`,
                            opacity: 0,
                        },
                    ],
                    { id: 'list-out', duration: LEAVE_MS, easing: 'ease-out' }
                )
            } else if (ghostCount++ < MAX_GHOSTS) {
                // Gone from the list. React has let go of its element, so it can be put
                // back where it was, outside the layout, just long enough to fade out.
                element.removeAttribute('data-entry-id')
                element.dataset.ghostId = id
                element.className = ''
                // Its buttons and links must not take focus or clicks while it fades
                element.inert = true
                Object.assign(element.style, {
                    position: 'absolute',
                    left: `${rect.left - rootRect.left}px`,
                    top: `${rect.top - rootRect.top}px`,
                    width: `${rect.width}px`,
                    height: `${rect.height}px`,
                })
                // Whatever was running on it stopped mattering when it left the list
                element.getAnimations().forEach(animation => animation.cancel())
                ghosts.appendChild(element)
                const remove = () => element.remove()
                element
                    .animate([{ opacity, transform: 'none' }, { opacity: 0, transform: 'scale(0.94)' }], {
                        id: 'list-ghost',
                        duration: LEAVE_MS,
                        easing: 'ease-out',
                        // Stay faded out until removed, so the ghost can never flash back
                        fill: 'forwards',
                    })
                    .finished.then(remove, remove)
            }
        })
    }

    render() {
        return (
            <div ref={this.root} className={cn('relative', this.props.className)}>
                {this.props.children}
                {/* Departing entries fade out here, laid over the list without taking up room in it */}
                <div ref={this.ghosts} data-list-ghosts aria-hidden className="pointer-events-none absolute inset-0" />
            </div>
        )
    }
}
