<script lang="ts">
    /**
     * A key or a shortcut written out, such as Ctrl K in the search launcher or Enter in the
     * palette's footer (design-system.md, stage 3 item 7): one look wherever a key is named, a
     * hairline of the surrounding text's own colour round it, so it reads on a page, a Card, a
     * Tray and a Popover alike. An icon given as its content (an arrow) is drawn at the text's
     * size.
     */
    import type { Snippet } from 'svelte'
    import type { HTMLAttributes } from 'svelte/elements'

    interface Props extends HTMLAttributes<HTMLElement> {
        children: Snippet
    }

    let { class: className, children, ...rest }: Props = $props()
</script>

<kbd {...rest} class={['kbd', className]}>{@render children()}</kbd>

<style>
    .kbd {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: none;
        min-width: 1.2rem;
        height: 1.2rem;
        padding: 0 0.3rem;
        border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
        border-radius: var(--r-chip);
        background: none;
        color: inherit;
        font-family: inherit;
        font-size: var(--fs-caption);
        font-weight: inherit;
        line-height: 1;
        white-space: nowrap;
        vertical-align: middle;
    }

    .kbd :global(svg) {
        width: 0.55rem;
        height: 0.55rem;
    }
</style>
