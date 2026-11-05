<script lang="ts">
    import Draggable from '#cmp/shared/draggable/Draggable.svelte'
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import FaGripHorizontal from '~icons/fa-solid/grip-horizontal'
    import Button from '#cmp/shared/button/Button.svelte'
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
    <Icon
        style="cursor:inherit; padding: 0.2rem 0.4rem; height: 1.4rem; width: 1.6rem; min-width: 1.6rem"
    >
        <FaGripHorizontal />
    </Icon>
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
    <Button
        style="padding: 0.2rem 0.3rem; height: 1.4rem; border-radius: 0.3rem"
        cssVar="secondary"
        {@attach tooltip(onClose ? closeTitle : '', { shortcut: closeShortcut })}
        aria-label={onClose ? 'Close' : undefined}
        onClick={(e) => {
            e.stopPropagation()
            if (onClose) return onClose()
            hidden = !hidden
        }}
    >
        <Icon size={1.1}>
            {#if onClose}
                <FaWindowRestore />
            {:else if !hidden}
                <FaEye />
            {:else}
                <FaEyeSlash />
            {/if}
        </Icon>
    </Button>
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
        class:resizing={resizing !== null}
        class:sized={resizable && !collapsed}
        style={resizable && !collapsed ? `width: ${width}px; height: ${height}px;` : ''}
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
    {/if}
</Draggable>

<style lang="scss">
    .tab-header {
        display: flex;
        min-width: 12rem;
        width: 100%;
        color: var(--secondary-text);
        margin-bottom: -0.1rem;
        box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);
        justify-content: space-between;
        gap: 0.3rem;
        z-index: 2;
        height: 1.6rem;
        transition: all 0.2s cubic-bezier(0, 1, 1, 1);
        align-items: center;
        cursor: move;
        background-color: var(--secondary);
        color: var(--secondary-text);
        font-family: Rubik;
        /* a button's own default, written down so the bar reads the same as a div */
        font-size: 0.85rem;
        position: relative;
        border-top-left-radius: 0.4rem;
        border-top-right-radius: 0.4rem;
        border: 0.1rem solid transparent;
        border-color: var(--accent2);
        &.hidden {
            width: 0;
            min-width: 9rem;
            border-bottom-left-radius: 0.4rem;
            border-bottom-right-radius: 0.4rem;
        }
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

    .draggable-container-content {
        interpolate-size: allow-keywords; /* 👈 */
        border: 0.1rem solid var(--accent2);
        border-bottom-left-radius: 0.8rem;
        border-bottom-right-radius: 0.8rem;
        height: auto;
        transition: all 0.2s;
        overflow: hidden;
        &.hidden {
            border: 0.1rem solid transparent;
            height: 0;
            transition: all 0s;
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
