<script lang="ts">
    /**
     * The card of one element's Tooltip, mounted beside the other cards of its theme subtree while
     * its element has the Tooltip. It is a manual popover, so it sits in the top layer above clipped
     * and transformed panels, and it stays in the document while hidden: its content is the
     * element's description whether or not the card shows. Placed by hand above its element (or
     * on the side asked for), and drawn as one outline with its arrow.
     */
    import { untrack } from 'svelte'
    import { shortcutLabel } from '#stores/shortcutsStore.ts'
    import CardOutline from './CardOutline.svelte'
    import { placeCard, type Side } from './floating'
    import type { Tooltip } from './tooltip.svelte.ts'

    let { tooltip }: { tooltip: Tooltip } = $props()

    const ARROW = 6
    const GAP = 6
    const RADIUS = 6
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

    function reducedMotion() {
        return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    }

    function place() {
        width = card.offsetWidth
        height = card.offsetHeight
        const placed = placeCard(
            tooltip.trigger.getBoundingClientRect(),
            { width, height },
            {
                side: tooltip.placement,
                gap: GAP,
                arrow: ARROW,
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
        if (side === 'top') return [arrowAt, height + ARROW]
        if (side === 'bottom') return [arrowAt, -ARROW]
        if (side === 'left') return [width + ARROW, arrowAt]
        return [-ARROW, arrowAt]
    }

    function opening(instant: boolean) {
        animation?.cancel()
        if (!shown) card.showPopover()
        shown = true
        place()
        if (reducedMotion() || typeof card.animate !== 'function') return
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
            //Svelte's cubicOut
            { duration: 120, easing: 'cubic-bezier(0.33, 1, 0.68, 1)' }
        )
    }

    function closing(instant: boolean) {
        animation?.cancel()
        if (!shown) return
        const done = () => {
            shown = false
            card.hidePopover()
        }
        if (instant || reducedMotion() || typeof card.animate !== 'function') return done()
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
    <CardOutline
        {width}
        {height}
        radius={RADIUS}
        {side}
        at={arrowAt}
        arrow={ARROW}
        fill="var(--tertiary)"
        stroke="color-mix(in srgb, var(--tertiary-text) 15%, transparent)"
        shadow={{ y: 4, blur: 12, opacity: 0.25 }}
    />
    <!-- the comma for the description only, which a screen reader reads as "Undo, Ctrl+Z" -->
    <span class="content" id={tooltip.contentId}
        >{#if typeof tooltip.content === 'string'}{tooltip.content}{:else}{@render tooltip.content()}{/if}{#if tooltip.shortcut}<span
                class="visually-hidden">,</span
            >
            <kbd>{shortcutLabel(tooltip.shortcut)}</kbd>{/if}</span
    >
</div>

<style lang="scss">
    /* placed by hand rather than by the popover's centring, and drawing no surface of its own: the
       outline is its background, border and shadow; no display of its own either, which would
       override the popover's hiding */
    .tooltip {
        position: fixed;
        inset: auto;
        width: max-content;
        max-width: min(18rem, calc(100vw - 8px));
        margin: 0;
        padding: 0.3rem 0.55rem;
        overflow: visible;
        border: 0;
        background: transparent;
        color: var(--tertiary-text);
        font-size: 0.8rem;
        line-height: 1.35;
        text-align: left;
        white-space: pre-line;
        overflow-wrap: anywhere;
    }

    kbd {
        margin-left: 0.2rem;
        padding: 0 0.3rem;
        border: 1px solid color-mix(in srgb, var(--tertiary-text) 25%, transparent);
        border-radius: 0.25rem;
        font-family: inherit;
        font-size: 0.75rem;
        white-space: nowrap;
        opacity: 0.85;
    }
</style>
