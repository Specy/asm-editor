<script lang="ts" module>
    import type { Component } from 'svelte'

    export type ContextMenuEntry =
        | {
              label: string
              icon?: Component
              disabled?: boolean
              /** Drawn in red, for what cannot be taken back. */
              danger?: boolean
              onSelect: () => void
          }
        | { separator: true }
</script>

<script lang="ts">
    /**
     * A menu opened at a point, a right click's: it lists `items` and closes on a pick, Escape, Tab,
     * a press outside it, or the page scrolling or resizing under it. As Select's list does, it is a
     * manual popover, so it sits in the browser's top layer above transformed or clipped panels
     * while staying in its host's subtree and theme. It opens with its first item focused and moves
     * between items with the arrow keys, Home and End; closing gives focus back to where it was.
     *
     * A menu about one item (a File's row, a register's value) points at it: an arrow on its edge
     * has its tip on the point, so the menu sits where the pointer is, as menus everywhere do, and
     * still shows what it is about. It opens below the point, above it near the bottom of the
     * screen, and slides left near the right edge, the arrow staying on the point (the Tooltips
     * design, decision 12).
     */
    import { onMount, tick } from 'svelte'
    import CardOutline from '#cmp/shared/floating/CardOutline.svelte'
    import { placeCard, type Side } from '#cmp/shared/floating/floating.ts'

    interface Props {
        /** The point it opens at, in viewport coordinates; it moves inwards to stay on screen. */
        x: number
        y: number
        items: readonly ContextMenuEntry[]
        label?: string
        /**
         * Whether it is about one item, which an arrow with its tip on the point shows; left out
         * for a menu about nothing in particular, such as the Explorer's for its empty space.
         */
        arrow?: boolean
        onClose: () => void
    }

    let { x, y, items, label = 'Context menu', arrow = false, onClose }: Props = $props()

    const EDGE = 4
    const ARROW = 6
    /** 0.4rem, the corner the outline is drawn with. */
    const RADIUS = 6.4
    let menu: HTMLDivElement
    let left = $state(0)
    let top = $state(0)
    let width = $state(0)
    let height = $state(0)
    let side = $state<Side>('bottom')
    let at = $state(0)
    let previousFocus: Element | null = null

    function place() {
        width = menu.offsetWidth
        height = menu.offsetHeight
        const placed = placeCard(
            { left: x, top: y, width: 0, height: 0 },
            { width, height },
            {
                side: 'bottom',
                gap: 0,
                arrow: arrow ? ARROW : 0,
                radius: RADIUS,
                align: 'start',
                margin: EDGE,
                viewport: { width: window.innerWidth, height: window.innerHeight }
            }
        )
        left = placed.left
        top = placed.top
        side = placed.side
        at = placed.arrow
    }

    function buttons(): HTMLButtonElement[] {
        return Array.from(menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
    }

    function close() {
        onClose()
        if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
            previousFocus.focus({ preventScroll: true })
        }
    }

    function pick(entry: Extract<ContextMenuEntry, { label: string }>) {
        if (entry.disabled) return
        close()
        entry.onSelect()
    }

    function onKeydown(event: KeyboardEvent) {
        const all = buttons()
        const index = all.indexOf(document.activeElement as HTMLButtonElement)
        let next: HTMLButtonElement | undefined
        if (event.key === 'ArrowDown') next = all[(index + 1) % all.length]
        else if (event.key === 'ArrowUp') next = all[(index - 1 + all.length) % all.length]
        else if (event.key === 'Home') next = all[0]
        else if (event.key === 'End') next = all[all.length - 1]
        else if (event.key === 'Escape' || event.key === 'Tab') {
            event.preventDefault()
            close()
            return
        } else return
        event.preventDefault()
        next?.focus()
    }

    onMount(() => {
        previousFocus = document.activeElement
        menu.showPopover()
        place()
        void tick().then(() => buttons()[0]?.focus({ preventScroll: true }))

        const onPointerDown = (event: PointerEvent) => {
            if (!menu.contains(event.target as Node)) close()
        }
        //a scroll inside the menu is not the page moving under it
        const onScroll = (event: Event) => {
            if (!menu.contains(event.target as Node)) close()
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
        }
    })
</script>

<div
    class="context-menu"
    popover="manual"
    role="menu"
    tabindex="-1"
    aria-label={label}
    style:left="{left}px"
    style:top="{top}px"
    bind:this={menu}
    onkeydown={onKeydown}
    oncontextmenu={(event) => event.preventDefault()}
>
    <CardOutline
        {width}
        {height}
        radius={RADIUS}
        {side}
        at={arrow ? at : undefined}
        arrow={ARROW}
        fill="color-mix(in srgb, var(--tertiary) 85%, transparent)"
        stroke="color-mix(in srgb, var(--tertiary-text) 15%, transparent)"
        blur
        shadow={{ y: 8, blur: 24, opacity: 0.35 }}
    />
    {#each items as entry, index (index)}
        {#if 'separator' in entry}
            <div class="separator" role="separator"></div>
        {:else}
            {@const Icon = entry.icon}
            <button
                class="item"
                class:danger={entry.danger}
                role="menuitem"
                disabled={entry.disabled}
                onclick={() => pick(entry)}
            >
                <span class="icon" aria-hidden="true">
                    {#if Icon}<Icon />{/if}
                </span>
                <span class="label">{entry.label}</span>
            </button>
        {/if}
    {/each}
</div>

<style lang="scss">
    /* fixed, as Select's list is, and placed by hand rather than by the popover's centring; a
       translucent tint of the raised --tertiary surface, as Monaco's own menu is, that blurs what
       is beneath, as the app's prompts are. The outline draws that surface, its edge and its shadow
       as one shape with the arrow, so the menu draws none of its own; the padding keeps the room
       the edge took */
    .context-menu {
        position: fixed;
        inset: auto;
        z-index: 100;
        display: flex;
        flex-direction: column;
        min-width: 11rem;
        max-width: min(18rem, calc(100vw - 8px));
        margin: 0;
        padding: calc(0.25rem + 1px);
        overflow: visible;
        border: 0;
        background: transparent;
        color: var(--tertiary-text);
        font-size: 0.8rem;
        outline: none;
    }

    /* rows and separators in whole multiples of 4px, so every separator sits at the same fraction
       of a device pixel at 125%, 150% or 175% zoom and none is drawn a pixel thicker than another */
    .item {
        display: flex;
        flex-shrink: 0;
        align-items: center;
        gap: 0.55rem;
        width: 100%;
        height: 28px;
        padding: 0 0.6rem;
        border: 0;
        border-radius: 0.3rem;
        color: inherit;
        background: transparent;
        font: inherit;
        text-align: left;
        cursor: pointer;

        &:hover:not(:disabled),
        &:focus-visible {
            background-color: rgba(var(--RGB-accent), 0.25);
            outline: none;
        }

        &:disabled {
            cursor: not-allowed;
            opacity: 0.4;
        }

        &.danger:not(:disabled) {
            color: var(--red);
        }
    }

    .icon {
        display: grid;
        flex: 0 0 0.9rem;
        place-items: center;
        width: 0.9rem;
        height: 0.9rem;
        opacity: 0.85;

        :global(svg) {
            width: 0.8rem;
            height: 0.8rem;
        }
    }

    .label {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    /* edge to edge through the menu's padding, as Monaco's are, and 8px tall with its margins */
    .separator {
        flex-shrink: 0;
        height: 1px;
        margin: 4px -0.25rem 3px;
        background-color: color-mix(in srgb, var(--tertiary-text) 15%, transparent);
    }
</style>
