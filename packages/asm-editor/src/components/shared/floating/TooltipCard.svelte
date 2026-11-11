<script lang="ts">
    /**
     * The card of one element's Tooltip, mounted beside the other cards of its theme subtree while
     * its element has the Tooltip. It is a manual popover, so it sits in the top layer above clipped
     * and transformed panels, and it stays in the document while hidden: its content is the
     * element's description whether or not the card shows. Placed by hand above its element (or
     * on the side asked for), and drawn as one outline with its arrow.
     */
    import { untrack } from 'svelte'
    import { POPOVER_ARROW, tooltipRadius } from '#src/styles/elevation.ts'
    import { DUR_FAST, EASE_OUT, prefersLessMotion } from '#src/styles/motion.ts'
    import PopoverOutline from './PopoverOutline.svelte'
    import Kbd from '#cmp/shared/misc/Kbd.svelte'
    import ShortcutKeys from '#cmp/shared/misc/ShortcutKeys.svelte'
    import { placeCard, type Side } from './floating'
    import type { Tooltip } from './tooltip.svelte.ts'

    let { tooltip }: { tooltip: Tooltip } = $props()

    const GAP = 6
    /**
     * The corner the outline is drawn with, which the arrow keeps clear of: a control's, smaller
     * than a menu's.
     */
    const RADIUS = tooltipRadius()
    const MARGIN = 4
    /** How far it slides out of its element as it opens. */
    const SLIDE = 4

    let card: HTMLDivElement
    let width = $state(0)
    let height = $state(0)
    let side = $state<Side>('top')
    let arrowAt = $state(0)
    let shown = false
    let animation: Animation | undefined

    function place() {
        width = card.offsetWidth
        height = card.offsetHeight
        const placed = placeCard(
            tooltip.trigger.getBoundingClientRect(),
            { width, height },
            {
                side: tooltip.placement,
                gap: GAP,
                arrow: POPOVER_ARROW,
                radius: RADIUS,
                align: 'center',
                margin: MARGIN,
                viewport: { width: window.innerWidth, height: window.innerHeight }
            }
        )
        card.style.left = `${placed.left}px`
        card.style.top = `${placed.top}px`
        side = placed.side
        arrowAt = placed.arrow
    }

    /** Where the arrow's tip is in the card's box, which it grows out of. */
    function tip(): [x: number, y: number] {
        if (side === 'top') return [arrowAt, height + POPOVER_ARROW]
        if (side === 'bottom') return [arrowAt, -POPOVER_ARROW]
        if (side === 'left') return [width + POPOVER_ARROW, arrowAt]
        return [-POPOVER_ARROW, arrowAt]
    }

    function opening(instant: boolean) {
        animation?.cancel()
        if (!shown) card.showPopover()
        shown = true
        place()
        if (prefersLessMotion() || typeof card.animate !== 'function') return
        if (instant) {
            animation = card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 80 })
            return
        }
        const [x, y] = tip()
        const towards = {
            top: [0, SLIDE],
            bottom: [0, -SLIDE],
            left: [SLIDE, 0],
            right: [-SLIDE, 0]
        }
        const [dx, dy] = towards[side]
        animation = card.animate(
            [
                {
                    opacity: 0,
                    transform: `translate(${dx}px, ${dy}px) scale(0.96)`,
                    transformOrigin: `${x}px ${y}px`
                },
                { opacity: 1, transform: 'none', transformOrigin: `${x}px ${y}px` }
            ],
            //--dur-fast and --ease-out, Svelte's cubicOut
            { duration: DUR_FAST, easing: EASE_OUT }
        )
    }

    function closing(instant: boolean) {
        animation?.cancel()
        if (!shown) return
        const done = () => {
            shown = false
            //the card leaves the page with its element, which can go while it fades: Svelte has
            //cleared `card` by then, and a popover no longer on the page cannot be hidden (one
            //on the page that is already hidden hides again without complaint)
            if (card?.isConnected) card.hidePopover()
        }
        if (instant || prefersLessMotion() || typeof card.animate !== 'function') return done()
        animation = card.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: 80,
            fill: 'forwards'
        })
        animation.onfinish = () => {
            if (!tooltip.open) done()
            animation?.cancel()
        }
    }

    $effect(() => {
        const { open, instant } = tooltip
        untrack(() => (open ? opening(instant) : closing(instant)))
    })

    //a fade still running when the Tooltip goes is stopped with it: a cancelled animation fires no
    //`onfinish`, which would otherwise reach for the card after it has left the page
    $effect(() => () => animation?.cancel())

    //new content or a new size while it shows, placed again around the same element
    $effect(() => {
        void [tooltip.content, tooltip.shortcut, tooltip.placement]
        untrack(() => {
            if (shown) place()
        })
    })
</script>

<!-- not focusable and holding nothing to click: the pointer only rests on it, to read it -->
<div
    bind:this={card}
    class="tooltip"
    popover="manual"
    role="tooltip"
    id={tooltip.id}
    onpointerenter={(event) => event.pointerType !== 'touch' && tooltip.keep()}
    onpointerleave={(event) => event.pointerType !== 'touch' && tooltip.leave()}
>
    <PopoverOutline {width} {height} {side} at={arrowAt} corner="control" solid />
    {#if tooltip.heading}
        <span class="heading" aria-hidden="true">{tooltip.heading}</span>
    {/if}
    <!-- the comma for the description only, which a screen reader reads as "Undo, Ctrl+Z" -->
    <span class="content" id={tooltip.contentId}
        >{#if typeof tooltip.content === 'string'}{tooltip.content}{:else}{@render tooltip.content()}{/if}{#if tooltip.shortcut}<span
                class="visually-hidden">,</span
            >
            <Kbd class="shortcut"><ShortcutKeys shortcut={tooltip.shortcut} /></Kbd>{/if}</span
    >
</div>

<style lang="scss">
    @use '../../../styles/popover.scss';

    /* placed by hand rather than by the popover's centring, and drawing no surface of its own: the
       outline is its background, border and shadow, a solid Popover's on a control's corner
       (popover.anchored) */
    .tooltip {
        @include popover.anchored;
        width: max-content;
        max-width: min(18rem, calc(100vw - 8px));
        padding: 0.3rem 0.55rem;
        font-size: var(--fs-small);
        line-height: 1.35;
        text-align: left;
        white-space: pre-line;
        overflow-wrap: anywhere;
    }

    .heading {
        display: block;
        font-weight: 600;
    }

    .content :global(.shortcut) {
        margin-left: 0.2rem;
    }
</style>
