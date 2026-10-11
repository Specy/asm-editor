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
     */
    import { onMount, tick } from 'svelte'

    interface Props {
        /** The point it opens at, in viewport coordinates; it moves inwards to stay on screen. */
        x: number
        y: number
        items: readonly ContextMenuEntry[]
        label?: string
        onClose: () => void
    }

    let { x, y, items, label = 'Context menu', onClose }: Props = $props()

    const EDGE = 4
    let menu: HTMLDivElement
    let left = $state(0)
    let top = $state(0)
    let previousFocus: Element | null = null

    function place() {
        const { width, height } = menu.getBoundingClientRect()
        left = Math.max(EDGE, Math.min(x, window.innerWidth - width - EDGE))
        top = Math.max(EDGE, Math.min(y, window.innerHeight - height - EDGE))
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
    /* fixed, as Select's list is, and placed by hand rather than by the popover's centring */
    .context-menu {
        position: fixed;
        inset: auto;
        z-index: 100;
        display: flex;
        flex-direction: column;
        min-width: 11rem;
        max-width: min(18rem, calc(100vw - 8px));
        margin: 0;
        padding: 0.25rem;
        border: none;
        border-radius: 0.4rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
        box-shadow: 0 0.5rem 1.5rem rgba(0, 0, 0, 0.35);
        font-size: 0.8rem;
        outline: none;
    }

    .item {
        display: flex;
        align-items: center;
        gap: 0.55rem;
        width: 100%;
        padding: 0.38rem 0.6rem;
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

    .separator {
        height: 1px;
        margin: 0.25rem 0.3rem;
        background-color: var(--tertiary);
    }
</style>
