<script lang="ts">
    /**
     * The Share button's dropdown: two switches for what the link does when it is opened, both off
     * by default, and a Copy link button under them. Running needs a Build, so turning Run on turns
     * Build on, and turning Build off turns Run off. Placed and drawn as ContextMenu is: a manual
     * popover in the top layer, with an arrow pointing at the button, closed by Escape, a press
     * outside it, or the page scrolling or resizing under it.
     */
    import { tick, type Snippet } from 'svelte'
    import PopoverOutline from '#cmp/shared/floating/PopoverOutline.svelte'
    import { placeCard, type Side } from '#cmp/shared/floating/floating.ts'
    import { popoverElevation } from '#src/styles/elevation.ts'
    import Switch from '#cmp/shared/input/Switch.svelte'
    import type { ShareStartAction } from '#lib/shareStart.ts'

    let {
        onShare,
        trigger
    }: {
        onShare: (action?: ShareStartAction) => void
        trigger: Snippet<[{ open: (event: MouseEvent) => void; expanded: boolean }]>
    } = $props()

    let at = $state<{ x: number; y: number } | null>(null)
    let triggerElement: HTMLElement | undefined
    let build = $state(false)
    let run = $state(false)

    function open(event: MouseEvent) {
        if (at) {
            at = null
            return
        }
        triggerElement = event.currentTarget as HTMLElement
        const bounds = triggerElement.getBoundingClientRect()
        at = { x: bounds.left + 16, y: bounds.bottom + 4 }
    }

    function copy() {
        at = null
        onShare(run ? 'buildAndRun' : build ? 'build' : undefined)
    }

    const EDGE = 4
    const ARROW = 6
    /** The corner the outline is drawn with, which the arrow keeps clear of. */
    const RADIUS = popoverElevation().radius
    let panel = $state<HTMLDivElement>()
    let left = $state(0)
    let top = $state(0)
    let width = $state(0)
    let height = $state(0)
    let side = $state<Side>('bottom')
    let arrowAt = $state(0)

    function place(point: { x: number; y: number }) {
        if (!panel) return
        width = panel.offsetWidth
        height = panel.offsetHeight
        const placed = placeCard(
            { left: point.x, top: point.y, width: 0, height: 0 },
            { width, height },
            {
                side: 'bottom',
                gap: 0,
                arrow: ARROW,
                radius: RADIUS,
                align: 'start',
                margin: EDGE,
                viewport: { width: window.innerWidth, height: window.innerHeight }
            }
        )
        left = placed.left
        top = placed.top
        side = placed.side
        arrowAt = placed.arrow
    }

    function mount(node: HTMLDivElement) {
        const point = at!
        const previousFocus = document.activeElement
        node.showPopover()
        place(point)
        void tick().then(() =>
            node.querySelector<HTMLElement>('button')?.focus({ preventScroll: true })
        )
        const close = () => (at = null)
        const onPointerDown = (event: PointerEvent) => {
            //the trigger toggles it itself
            const target = event.target as Node
            if (!node.contains(target) && !triggerElement?.contains(target)) close()
        }
        const onScroll = (event: Event) => {
            if (!node.contains(event.target as Node)) close()
        }
        window.addEventListener('pointerdown', onPointerDown, true)
        window.addEventListener('scroll', onScroll, true)
        window.addEventListener('resize', close)
        window.addEventListener('blur', close)
        return () => {
            window.removeEventListener('pointerdown', onPointerDown, true)
            window.removeEventListener('scroll', onScroll, true)
            window.removeEventListener('resize', close)
            window.removeEventListener('blur', close)
            if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
                previousFocus.focus({ preventScroll: true })
        }
    }
</script>

{@render trigger({ open, expanded: at !== null })}
{#if at}
    <div
        class="share-menu"
        role="dialog"
        tabindex="-1"
        aria-label="Share options"
        popover="manual"
        style:left="{left}px"
        style:top="{top}px"
        bind:this={panel}
        {@attach mount}
        onkeydown={(event) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            at = null
        }}
    >
        <PopoverOutline {width} {height} {side} at={arrowAt} arrow={ARROW} />
        <label class="row">
            <span>Build on open</span>
            <Switch
                bind:checked={build}
                style="--switch-width: 2.2rem; --switch-height: 1.2rem;"
                onChange={(on) => {
                    if (!on) run = false
                }}
            />
        </label>
        <label class="row">
            <span>Run after building</span>
            <Switch
                bind:checked={run}
                style="--switch-width: 2.2rem; --switch-height: 1.2rem;"
                onChange={(on) => {
                    if (on) build = true
                }}
            />
        </label>
        <button type="button" class="copy" onclick={copy}>Copy link</button>
    </div>
{/if}

<style lang="scss">
    @use '../../../styles/popover.scss';

    /* a Popover, as ContextMenu is: the outline draws the tint, edge, shadow and arrow as one
       shape */
    .share-menu {
        @include popover.content;
        position: fixed;
        inset: auto;
        z-index: 100;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        min-width: 13rem;
        margin: 0;
        padding: 0.6rem;
        overflow: visible;
        border: 0;
        background: transparent;
        font-size: var(--fs-small);
        outline: none;
    }
    .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        cursor: pointer;
    }
    .copy {
        margin-top: 0.2rem;
        padding: 0.45rem 0.8rem;
        border: 0;
        /* as far in from the Popover's edge as its corner is round, so clear of the curve: a
           control's own corner (D12) */
        border-radius: var(--r-control);
        background-color: var(--accent);
        color: var(--accent-text);
        font: inherit;
        cursor: pointer;
        /* the primary Button's hover, which the look decision keeps (D5) */
        &:hover {
            background-color: color-mix(in srgb, var(--accent) 85%, white);
        }
    }
</style>
