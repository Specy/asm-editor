<script lang="ts">
    import Draggable from '#cmp/shared/draggable/Draggable.svelte'
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import FaGripHorizontal from '~icons/fa-solid/grip-horizontal'
    import IconButton from '#cmp/shared/button/IconButton.svelte'
    import FaEye from '~icons/fa-solid/eye'
    import FaEyeSlash from '~icons/fa-solid/eye-slash'
    import FaWindowRestore from '~icons/fa-solid/window-restore'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    interface Props {
        hidden?: boolean
        title?: string
        hiddenOnMobile?: boolean
        left?: number
        top?: number
        /**
         * Read-only detail belonging with the title, rendered immediately after it on the left of
         * the bar. Deliberately not marked `data-no-drag`: it is text rather than a control, so it
         * is more useful as drag surface, like the title itself.
         */
        headerInfo?: import('svelte').Snippet
        /**
         * Controls of the caller's own, rendered at the right of the header bar, against the
         * button on its end. The bar is the drag handle, so they are marked `data-no-drag`,
         * which is where `Draggable` stops a press on them from picking the window up.
         */
        headerActions?: import('svelte').Snippet
        /**
         * What the button on the right of the header does. Left unset it is an eye that collapses
         * the body and leaves the bar in place, which is what a panel that lives only in this
         * window wants. Given, it closes the whole window through this callback instead — the
         * caller stops rendering the container — for a panel that has somewhere else to be.
         */
        onClose?: () => void
        closeTitle?: string
        /** The key that closes it too, shown in the close button's Tooltip. */
        closeShortcut?: string
        /**
         * Whether the window is resized by dragging its bottom corners, as a desktop window is: the
         * right one moves the right edge, the left one the left edge. Off unless asked for: the
         * Debug tools are as large as what they show. A resizable window takes its body's size from
         * `width` and `height`, which the corners change, kept inside the viewport and no smaller
         * than `minWidth` by `minHeight`.
         */
        resizable?: boolean
        width?: number
        height?: number
        minWidth?: number
        minHeight?: number
        /**
         * Called when a corner is let go, with the corner: the body follows the pointer freely
         * while it is dragged, and a caller whose content only comes in some sizes snaps it to
         * one here, keeping the edge the corner did not move.
         */
        onResizeEnd?: (corner: 'start' | 'end') => void
        /**
         * Whether the most the body shows is set by dragging its bottom edge, for a window as
         * large as what it shows: `maxHeight`, in pixels, which the edge changes, kept inside the
         * viewport and no lower than `minMaxHeight`; 0 leaves it to the content's own default.
         * The body hands it to its content as `--floating-body-max-height`, and the content, which
         * scrolls what is longer, takes its `max-height` from it; shorter content keeps its height.
         * The edge shows only while the content scrolls, which is the body's first element.
         */
        resizableMaxHeight?: boolean
        maxHeight?: number
        minMaxHeight?: number
        children?: import('svelte').Snippet
    }

    type Size = { width: number; height: number }

    let {
        hidden = $bindable(true),
        title = '',
        hiddenOnMobile = true,
        left = $bindable(300),
        top = $bindable(13),
        headerInfo,
        headerActions,
        onClose,
        closeTitle = 'Close',
        closeShortcut,
        resizable = false,
        width = $bindable(0),
        height = $bindable(0),
        minWidth = 160,
        minHeight = 120,
        onResizeEnd,
        resizableMaxHeight = false,
        maxHeight = $bindable(0),
        minMaxHeight = 160,
        children
    }: Props = $props()

    /** The room the corner leaves between the window and the viewport's edges, as a drag does. */
    const EDGE = 6
    /** The bottom corners, by the edge each moves: the left edge, and the right. */
    const CORNERS = ['start', 'end'] as const
    let content: HTMLElement | undefined = $state()
    let resizing = $state<'start' | 'end' | null>(null)
    let resizeStartX = 0
    let resizeStartY = 0
    let resizeStart: Size = { width: 0, height: 0 }
    let resizeStartLeft = 0
    let resizeMax: Size = { width: 0, height: 0 }

    function onResizeDown(e: PointerEvent, corner: 'start' | 'end') {
        if (e.button !== 0 || !content) return
        //the corner is inside the window, which must not take the press as the start of a drag
        e.preventDefault()
        e.stopPropagation()
        resizing = corner
        resizeStartX = e.clientX
        resizeStartY = e.clientY
        resizeStart = { width, height }
        resizeStartLeft = left
        //the body grows down and away from the corner's opposite edge, which stays where it is, so
        //the viewport past that edge is the most it can take; a window that already reached the
        //viewport's edge, as a phone's does, may stay there rather than being pulled off it
        const box = content.getBoundingClientRect()
        const roomX = corner === 'end' ? window.innerWidth - box.left : box.right
        const roomY = window.innerHeight - box.top
        resizeMax = {
            width: Math.max(0, roomX - EDGE, Math.min(width, roomX)),
            height: Math.max(0, roomY - EDGE, Math.min(height, roomY))
        }
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    }

    function onResizeMove(e: PointerEvent) {
        if (!resizing) return
        const across = e.clientX - resizeStartX
        const proposed = {
            width: resizeStart.width + (resizing === 'end' ? across : -across),
            height: resizeStart.height + e.clientY - resizeStartY
        }
        const nextWidth = Math.round(Math.min(resizeMax.width, Math.max(minWidth, proposed.width)))
        //the left corner moves the left edge, so the right one stays put
        if (resizing === 'start') left = resizeStartLeft + resizeStart.width - nextWidth
        width = nextWidth
        height = Math.round(Math.min(resizeMax.height, Math.max(minHeight, proposed.height)))
    }

    function onResizeUp(e: PointerEvent) {
        if (!resizing) return
        const corner = resizing
        resizing = null
        const target = e.currentTarget as HTMLElement
        if (target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId)
        onResizeEnd?.(corner)
    }

    let edgeStartY = 0
    let edgeStart = 0
    let edgeMax = 0
    let draggingEdge = $state(false)

    function onEdgeDown(e: PointerEvent) {
        if (e.button !== 0 || !content) return
        e.preventDefault()
        e.stopPropagation()
        draggingEdge = true
        edgeStartY = e.clientY
        //from the height the body has now, not the most it may have: content shorter than that
        //shrinks as soon as the edge moves up
        edgeStart = content.clientHeight || maxHeight
        const room = window.innerHeight - content.getBoundingClientRect().top
        edgeMax = Math.max(minMaxHeight, room - EDGE, Math.min(edgeStart, room))
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    }

    function onEdgeMove(e: PointerEvent) {
        if (!draggingEdge) return
        const proposed = edgeStart + e.clientY - edgeStartY
        maxHeight = Math.round(Math.min(edgeMax, Math.max(minMaxHeight, proposed)))
    }

    function onEdgeUp(e: PointerEvent) {
        if (!draggingEdge) return
        draggingEdge = false
        const target = e.currentTarget as HTMLElement
        if (target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId)
    }

    /**
     * Whether the content is longer than the body shows, which is when the edge is offered: the
     * body's size and what is in it change as the program runs, so it is measured again, once a
     * frame at most, after either does.
     */
    let overflowing = $state(false)
    $effect(() => {
        if (!resizableMaxHeight || collapsed || !content) return
        const body = content
        let frame = 0
        const measure = () => {
            frame = 0
            const scroller = body.firstElementChild
            overflowing = !!scroller && scroller.scrollHeight > scroller.clientHeight + 1
        }
        const schedule = () => {
            if (!frame) frame = requestAnimationFrame(measure)
        }
        const resizes = new ResizeObserver(schedule)
        const mutations = new MutationObserver(schedule)
        resizes.observe(body)
        mutations.observe(body, { childList: true, subtree: true, characterData: true })
        measure()
        return () => {
            resizes.disconnect()
            mutations.disconnect()
            cancelAnimationFrame(frame)
        }
    })

    const bodyStyle = $derived.by(() => {
        if (collapsed) return ''
        if (resizable) return `width: ${width}px; height: ${height}px;`
        if (resizableMaxHeight && maxHeight > 0)
            return `--floating-body-max-height: ${Math.max(minMaxHeight, maxHeight)}px;`
        return ''
    })

    //a window the caller can take away has no collapsed state: its bar goes with its body
    const collapsed = $derived(onClose ? false : hidden)
    //the body is built the first time the window opens and only folded away after that, so
    //opening it again shows what is there instead of building it anew
    let opened = false
    const mounted = $derived.by(() => {
        if (!collapsed) opened = true
        return opened
    })

    let dragStartX = 0
    let dragStartY = 0

    function onHeaderPointerDown(e: PointerEvent) {
        dragStartX = e.clientX
        dragStartY = e.clientY
    }

    function onHeaderClick(e: MouseEvent) {
        //the injected controls sit inside the header, which is itself the collapse button
        if (e.target instanceof Element && e.target.closest('.header-actions')) return
        const dx = e.clientX - dragStartX
        const dy = e.clientY - dragStartY
        if (dx * dx + dy * dy < 25) {
            hidden = !hidden
        }
    }
</script>

{#snippet bar()}
    <span class="grip" aria-hidden="true">
        <Icon size="small">
            <FaGripHorizontal />
        </Icon>
    </span>
    <div class="ellipsis">{title}</div>
    {#if headerInfo}
        <div class="header-info row">
            {@render headerInfo()}
        </div>
    {/if}
    {#if headerActions}
        <div class="header-actions row" data-no-drag>
            {@render headerActions()}
        </div>
    {/if}
    <!-- in the bar's corner, whose curve its own follows (the .bar-end rules) -->
    <IconButton
        size="sm"
        fill
        class="bar-end"
        label={onClose ? 'Close' : hidden ? `Show ${title}` : `Hide ${title}`}
        {@attach tooltip(onClose ? closeTitle : '', { shortcut: closeShortcut })}
        onClick={(e) => {
            e.stopPropagation()
            if (onClose) return onClose()
            hidden = !hidden
        }}
    >
        <Icon size="prose">
            {#if onClose}
                <FaWindowRestore />
            {:else if !hidden}
                <FaEye />
            {:else}
                <FaEyeSlash />
            {/if}
        </Icon>
    </IconButton>
{/snippet}

<Draggable {hiddenOnMobile} bind:left bind:top>
    {#snippet header()}
        {#if onClose}
            <!-- a plain bar: it only drags, and the caller's controls must not nest in a button -->
            <div class="tab-header row">
                {@render bar()}
            </div>
        {:else}
            <button
                class="tab-header row"
                class:hidden
                onpointerdown={onHeaderPointerDown}
                onclick={onHeaderClick}
            >
                {@render bar()}
            </button>
        {/if}
    {/snippet}
    <div
        class="draggable-container-content"
        class:hidden={collapsed}
        class:resizing={resizing !== null || draggingEdge}
        class:sized={resizable && !collapsed}
        style={bodyStyle}
        bind:this={content}
    >
        {#if mounted}
            {@render children?.()}
        {/if}
    </div>
    {#if resizable && !collapsed}
        <!-- outside the body, which clips its rounded corners: a handle inside it would lose the
             corner it sits in to the clipping, for the pointer as much as for the eye -->
        {#each CORNERS as corner (corner)}
            <div
                class="resize-corner {corner}"
                aria-hidden="true"
                onpointerdown={(e) => onResizeDown(e, corner)}
                onpointermove={onResizeMove}
                onpointerup={onResizeUp}
                onpointercancel={onResizeUp}
            ></div>
        {/each}
    {:else if resizableMaxHeight && !collapsed && (overflowing || draggingEdge)}
        <!-- kept while it is dragged, so that a drag lengthening the body past its content does
             not lose the edge under the pointer -->
        <div
            class="resize-edge"
            aria-hidden="true"
            onpointerdown={onEdgeDown}
            onpointermove={onEdgeMove}
            onpointerup={onEdgeUp}
            onpointercancel={onEdgeUp}
        ></div>
    {/if}
</Draggable>

<style lang="scss">
    @use '../button/tray.scss';
    @use '../../../styles/radius.scss' as *;

    /* A Tray floating free over the Workbench (D3): its bar, the title strip it is dragged by, and
       its body below, one frame round both with the tray's lift. The frame is the window's own
       rather than the tray's hairline and corner: an --accent2 edge, which the hairline was too
       faint to show against the Workbench, on a control's corner rather than an overlay's, as the
       windows always had (owner, 2026-11-08). The edge is 1px, which screenWindow.ts measures the
       Screen's window by */
    $frame: var(--accent2);
    $corner: var(--r-control);

    .tab-header {
        display: flex;
        min-width: 12rem;
        width: 100%;
        color: var(--secondary-text);
        /* over the body's 1px top edge, by the 0.1rem screenWindow.ts counts the bar short by */
        margin-bottom: -0.1rem;
        box-shadow: var(--shadow-2);
        justify-content: space-between;
        gap: 0.3rem;
        z-index: 2;
        height: 1.6rem;
        transition-property: width, min-width, border-radius;
        transition-duration: var(--dur-base);
        transition-timing-function: cubic-bezier(0, 1, 1, 1);
        align-items: center;
        cursor: move;
        background-color: var(--secondary);
        color: var(--secondary-text);
        font-family: var(--font-ui);
        /* a button's own default, written down so the bar reads the same as a div */
        font-size: var(--fs-small);
        position: relative;
        border-top-left-radius: $corner;
        border-top-right-radius: $corner;
        border: 1px solid $frame;
        &.hidden {
            width: 0;
            min-width: 9rem;
            border-bottom-left-radius: $corner;
            border-bottom-right-radius: $corner;
        }
        /* over an open body its shadow falls round the window's top and sides only: the body
           casts the rest, and nothing falls from the bar into it */
        &:not(.hidden) {
            clip-path: inset(-2rem -2rem 0 -2rem);
        }
    }

    /* the bar's two ends are squares as tall as the bar inside its edge, the grip's at its start
       and the eye's (or Close's) at its end, each glyph centred in its own: the eye's hover fills
       its square from the bar's top edge to its bottom one */
    $bar-cell: calc(1.6rem - 2px);
    .grip {
        flex: none;
        align-self: stretch;
        width: $bar-cell;
        height: auto;
        display: grid;
        place-items: center;
        cursor: inherit;
    }

    /* the button at the bar's end, a filling IconButton, whose corner in the bar's corner runs
       parallel to the bar's, inside its edge (D12): its hover and its focus ring never cover the
       bar's rounded border. Folded, the bar is round at the bottom too. Its other corners are a
       small IconButton's */
    .tab-header :global(.bar-end) {
        --icon-button-cell: #{$bar-cell};
        --icon-button-radius: var(--r-chip) #{nested-radius($corner, $border: 1px)} var(--r-chip)
            var(--r-chip);
    }
    .tab-header.hidden :global(.bar-end) {
        --icon-button-radius: var(--r-chip) #{nested-radius($corner, $border: 1px)}
            #{nested-radius($corner, $border: 1px)} var(--r-chip);
    }

    .header-info {
        align-items: center;
        gap: 0.3rem;
    }

    .header-actions {
        align-items: center;
        gap: 0.3rem;
        cursor: default;
        /* against the button on the end of the bar, however wide the title and its detail are:
           the bar is `space-between`, which would otherwise strand the controls in the middle */
        margin-left: auto;
    }

    /* the tray's tint, which blurs what is beneath, under what the window shows, in the window's
       frame, its top edge under the bar's. Unfolding, the body grows to its height, but its blur
       and shadow are there whole from the first frame: grown with it, each frame drew them at a
       new radius, which stalled the opening, most of all the first few times (2026-11-10) */
    .draggable-container-content {
        @include tray.surface;
        interpolate-size: allow-keywords; /* 👈 */
        border-width: 1px;
        border-color: $frame;
        border-radius: 0 0 $corner $corner;
        height: auto;
        transition-property: height, background-color, border-color;
        transition-duration: var(--dur-base);
        overflow: hidden;
        /* folded, what it holds stays built but is skipped: not laid out, not drawn, out of the
           Tab order, and no wider than nothing, so the window is only as wide as its folded bar,
           and so is the strip it is dragged by */
        &.hidden {
            border: 1px solid transparent;
            background-color: transparent;
            backdrop-filter: none;
            box-shadow: none;
            height: 0;
            transition: none;
            content-visibility: hidden;
        }
        /* the body follows the pointer, not the pointer's position a fifth of a second ago */
        &.resizing {
            transition: none;
        }
        /* a body sized by its caller is still never narrower than the bar above it, whose
           controls would otherwise stick out past it */
        &.sized {
            min-width: 100%;
        }
    }

    /* two short diagonal strokes in each bottom corner, the mark a desktop window's resizable
       corner has, set a little outside the body so that they fall on its frame rather than on
       what a body that fills itself shows. `touch-action: none` keeps a finger's drag from
       scrolling the page instead */
    .resize-corner {
        --strokes:
            transparent 0 50%, currentColor 50% 57%, transparent 57% 70%, currentColor 70% 77%,
            transparent 77%;
        position: absolute;
        bottom: -0.3rem;
        width: 1rem;
        height: 1rem;
        touch-action: none;
        color: var(--secondary-text);
        opacity: 0.6;

        &:hover {
            opacity: 1;
        }
    }

    /* the bottom edge, a strip across the frame a little taller than it, marked by a short pill in
       its middle, which says the edge can be dragged */
    .resize-edge {
        position: absolute;
        left: 0.8rem;
        right: 0.8rem;
        /* centred on the body's 1px bottom border, whose outer edge is the window's bottom */
        bottom: -0.2rem;
        height: 0.5rem;
        cursor: ns-resize;
        touch-action: none;

        &::after {
            content: '';
            position: absolute;
            left: 50%;
            top: 50%;
            width: 2rem;
            height: 0.25rem;
            border-radius: 0.125rem;
            transform: translate(-50%, -50%);
            /* the frame's own colour, a thickening of the border, until the pointer is on it */
            background-color: $frame;
            transition: background-color var(--dur-fast);
        }

        &:hover::after,
        &:active::after {
            background-color: var(--secondary-text);
        }
    }

    .resize-corner.end {
        right: -0.3rem;
        cursor: nwse-resize;
        background: linear-gradient(135deg, var(--strokes));
        border-bottom-right-radius: 0.4rem;
    }

    .resize-corner.start {
        left: -0.3rem;
        cursor: nesw-resize;
        background: linear-gradient(225deg, var(--strokes));
        border-bottom-left-radius: 0.4rem;
    }
</style>
