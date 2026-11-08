/**
 * A Popover opened at a point and pointing at it (design-system.md, D3; the Tooltips design,
 * decision 12): the context menu at a right click, the share menu under its button. It is a
 * manual popover, so it sits in the browser's top layer above transformed or clipped panels while
 * staying in its host's subtree and theme. This places it against the point, keeps the size and
 * the arrow `PopoverOutline` draws round it, and closes it on a press outside it, the page
 * scrolling or resizing under it, or the window losing focus. It opens with its first enabled
 * button focused, and closing gives focus back to where it was. Its keys (Escape, a menu's
 * arrows) are its host's, which closes it with `close()`.
 *
 *     const popover = new AnchoredPopover({ point: () => ({ x, y }), onClose })
 *
 *     <div popover="manual" style:left="{popover.left}px" style:top="{popover.top}px"
 *         {@attach popover.attach}>
 *         <PopoverOutline width={popover.width} height={popover.height} side={popover.side}
 *             at={popover.at} />
 *
 * with `@include popover.anchored` (styles/popover.scss) on the element.
 */
import { tick, untrack } from 'svelte'
import type { Attachment } from 'svelte/attachments'
import { POPOVER_ARROW, popoverElevation } from '#src/styles/elevation.ts'
import { placeCard, type Side } from './floating'

/** The least room kept between the Popover and the viewport's edges. */
const EDGE = 4

export interface AnchoredPopoverOptions {
    /** The point it opens at, below it unless there is more room above, in viewport coordinates. */
    point: () => { x: number; y: number }
    /**
     * Whether an arrow with its tip on the point shows what it is about; on when left out. A menu
     * about nothing in particular, such as the Explorer's for its empty space, has none.
     */
    arrow?: () => boolean
    /** Takes it off the page: its host's own state, such as the point it was opened at. */
    onClose: () => void
    /** An element a press on is not a press outside it: the button that toggles it itself. */
    trigger?: () => Element | null | undefined
}

export class AnchoredPopover {
    /** Where its box is, in viewport coordinates, for its `left` and `top`. */
    left = $state(0)
    top = $state(0)
    /**
     * What `PopoverOutline` draws round it: its box's size, the side of the point it ended on, and
     * where along its facing edge the arrow's tip is, undefined for one with no arrow.
     */
    width = $state(0)
    height = $state(0)
    side = $state<Side>('bottom')
    at = $state<number | undefined>(undefined)

    #options: AnchoredPopoverOptions
    #previousFocus: Element | null = null

    constructor(options: AnchoredPopoverOptions) {
        this.#options = options
    }

    /** Closes it, and gives focus back to where it was before it opened. */
    close = () => {
        this.#options.onClose()
        const previous = this.#previousFocus
        if (previous instanceof HTMLElement && previous.isConnected) {
            previous.focus({ preventScroll: true })
        }
    }

    /**
     * `{@attach popover.attach}` on the popover element: shows, places and focuses it as it comes
     * on the page, and listens for what closes it while it is there. What it reads is read once,
     * so a change to the host's state does not open it again.
     */
    attach: Attachment<HTMLElement> = (node) =>
        untrack(() => {
            this.#previousFocus = document.activeElement
            node.showPopover()
            this.#place(node)
            void tick().then(() =>
                node
                    .querySelector<HTMLElement>('button:not(:disabled)')
                    ?.focus({ preventScroll: true })
            )

            const onPointerDown = (event: PointerEvent) => {
                const target = event.target as Node
                if (node.contains(target) || this.#options.trigger?.()?.contains(target)) return
                this.close()
            }
            //a scroll inside it is not the page moving under it
            const onScroll = (event: Event) => {
                if (!node.contains(event.target as Node)) this.close()
            }
            window.addEventListener('pointerdown', onPointerDown, true)
            window.addEventListener('scroll', onScroll, true)
            window.addEventListener('resize', this.close)
            window.addEventListener('blur', this.close)
            return () => {
                window.removeEventListener('pointerdown', onPointerDown, true)
                window.removeEventListener('scroll', onScroll, true)
                window.removeEventListener('resize', this.close)
                window.removeEventListener('blur', this.close)
            }
        })

    /**
     * Below the point, or above it near the bottom of the screen, its arrow as near its left end
     * as its corner allows and slid left near the right edge, the arrow staying on the point.
     */
    #place(node: HTMLElement) {
        const point = this.#options.point()
        const arrow = this.#options.arrow?.() ?? true
        this.width = node.offsetWidth
        this.height = node.offsetHeight
        const placed = placeCard(
            { left: point.x, top: point.y, width: 0, height: 0 },
            { width: this.width, height: this.height },
            {
                side: 'bottom',
                gap: 0,
                arrow: arrow ? POPOVER_ARROW : 0,
                radius: popoverElevation().radius,
                align: 'start',
                margin: EDGE,
                viewport: { width: window.innerWidth, height: window.innerHeight }
            }
        )
        this.left = placed.left
        this.top = placed.top
        this.side = placed.side
        this.at = arrow ? placed.arrow : undefined
    }
}
