<script lang="ts" module>
    import type { Component } from 'svelte'

    export type ContextMenuEntry =
        | {
              label: string
              icon?: Component
              disabled?: boolean
              /** Drawn in red, for what cannot be taken back. */
              danger?: boolean
              /** Drawn in the accent colour, for the one that moves things on, as the dock's Step. */
              accent?: boolean
              /** Its key, in the shortcut store's form (`Mod+KeyZ`), drawn at the row's end. */
              shortcut?: string
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
    import PopoverOutline from '#cmp/shared/floating/PopoverOutline.svelte'
    import { AnchoredPopover } from '#cmp/shared/floating/anchoredPopover.svelte.ts'
    import type { Box } from '#cmp/shared/floating/floating.ts'
    import Kbd from '#cmp/shared/misc/Kbd.svelte'
    import ShortcutKeys from '#cmp/shared/misc/ShortcutKeys.svelte'

    interface Props {
        /** The point it opens at, in viewport coordinates; it moves inwards to stay on screen. */
        x?: number
        y?: number
        /**
         * A box it opens beside instead of a point, the button that opens it, in viewport
         * coordinates, on `side` when that side has the room.
         */
        anchor?: Box
        side?: 'top' | 'bottom'
        /**
         * Whether a pick leaves it open, for commands pressed again and again, such as the dock's
         * Steps; it then closes only as every Popover does (Escape, Tab, a press outside it).
         */
        keepOpen?: boolean
        /** The button that opens it, a press on which is not a press outside it: it toggles it. */
        trigger?: () => Element | null | undefined
        items: readonly ContextMenuEntry[]
        label?: string
        /**
         * Whether it is about one item, which an arrow with its tip on the point shows; left out
         * for a menu about nothing in particular, such as the Explorer's for its empty space.
         */
        arrow?: boolean
        onClose: () => void
    }

    let {
        x = 0,
        y = 0,
        anchor,
        side,
        items,
        label = 'Context menu',
        arrow = false,
        keepOpen = false,
        trigger,
        onClose
    }: Props = $props()

    //placed, focused and closed as every Popover opened at a point is
    const popover = new AnchoredPopover({
        point: () => ({ x, y }),
        anchor: () => anchor,
        side: () => side,
        arrow: () => arrow,
        onClose: () => onClose(),
        trigger: () => trigger?.()
    })
    let menu: HTMLDivElement

    function buttons(): HTMLButtonElement[] {
        return Array.from(
            menu?.querySelectorAll<HTMLButtonElement>(
                'button:not(:disabled):not([aria-disabled="true"])'
            ) ?? []
        )
    }

    function pick(entry: Extract<ContextMenuEntry, { label: string }>) {
        if (entry.disabled) return
        if (!keepOpen) popover.close()
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
            popover.close()
            return
        } else return
        event.preventDefault()
        next?.focus()
    }
</script>

<div
    class="context-menu"
    popover="manual"
    role="menu"
    tabindex="-1"
    aria-label={label}
    style:left="{popover.left}px"
    style:top="{popover.top}px"
    bind:this={menu}
    {@attach popover.attach}
    onkeydown={onKeydown}
    oncontextmenu={(event) => event.preventDefault()}
>
    <PopoverOutline
        width={popover.width}
        height={popover.height}
        side={popover.side}
        at={popover.at}
    />
    {#each items as entry, index (index)}
        {#if 'separator' in entry}
            <div class="separator" role="separator"></div>
        {:else}
            {@const Icon = entry.icon}
            <button
                class="item"
                class:danger={entry.danger}
                class:accent={entry.accent}
                role="menuitem"
                disabled={!keepOpen && entry.disabled}
                aria-disabled={keepOpen ? !!entry.disabled : undefined}
                onclick={() => pick(entry)}
            >
                <span class="icon" aria-hidden="true">
                    {#if Icon}<Icon />{/if}
                </span>
                <span class="label ellipsis">{entry.label}</span>
                {#if entry.shortcut}
                    <Kbd class="shortcut"><ShortcutKeys shortcut={entry.shortcut} /></Kbd>
                {/if}
            </button>
        {/if}
    {/each}
</div>

<style lang="scss">
    @use '../../../styles/popover.scss';
    @use '../../../styles/radius.scss' as *;

    /* placed by hand rather than by the popover's centring (popover.anchored); a Popover, a
       translucent tint of the raised --tertiary surface, as Monaco's own menu is, that blurs what
       is beneath. The outline draws that surface, its edge and its shadow as one shape with the
       arrow, so the menu draws none of its own; the padding keeps the room the edge took */
    .context-menu {
        @include popover.anchored;
        display: flex;
        flex-direction: column;
        min-width: 11rem;
        max-width: min(18rem, calc(100vw - 8px));
        padding: calc(0.25rem + 1px);
        font-size: var(--fs-small);
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
        /* inside the menu's 1px edge and 0.25rem padding, its curve parallel to the menu's */
        border-radius: nested-radius(var(--r-overlay), $border: 1px, $inset: 0.25rem);
        color: inherit;
        background: transparent;
        font: inherit;
        text-align: left;
        cursor: pointer;

        /* the row the pointer or the arrow keys are on: the menu's text at 10% */
        &:hover:not(:disabled, [aria-disabled='true']),
        &:focus-visible {
            background-color: var(--hover-bg);
            outline: none;
        }

        /* a menu kept open marks a row unavailable rather than disabling it, so the row keeps the
           focus while the command it ran makes it unavailable, and the menu its keys */
        &:disabled,
        &[aria-disabled='true'] {
            cursor: not-allowed;
            opacity: 0.5;
        }

        /* in the danger colour through its icon and label, the row keeping the menu's text,
           which its hover is drawn from */
        &.danger:not(:disabled, [aria-disabled='true']) > span {
            color: var(--danger);
        }

        &.accent:not(:disabled, [aria-disabled='true']) > span {
            color: var(--accent);
        }
    }

    /* its key at the row's end, quieter than its name */
    .item :global(.shortcut) {
        margin-left: auto;
        padding-left: 0.3rem;
        opacity: 0.7;
        font-size: 0.75rem;
    }

    .icon {
        display: grid;
        flex: 0 0 0.9rem;
        place-items: center;
        width: 0.9rem;
        height: 0.9rem;
        opacity: 0.85;

        :global(svg) {
            width: var(--fs-small);
            height: var(--fs-small);
        }
    }

    .label {
        min-width: 0;
    }

    /* edge to edge through the menu's padding, as Monaco's are, and 8px tall with its margins */
    .separator {
        flex-shrink: 0;
        height: 1px;
        margin: 4px -0.25rem 3px;
        background-color: var(--line);
    }
</style>
