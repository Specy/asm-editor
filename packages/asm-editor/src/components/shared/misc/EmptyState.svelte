<script lang="ts">
    /**
     * What a list, a panel or a page shows when it has nothing to show: no files, no problems, no
     * match (design-system.md, stage 3 item 7). One look for all of them, a short line in the
     * surface's muted text (`--text-muted`, D17) at the small step, in the interface font whatever
     * the panel's own (the Log's and the hex editor's are monospace); `title` adds a line above it
     * in the surrounding text, weighted, for a page's empty list. Its padding is
     * `--empty-state-padding` (0.8rem), which a host whose content already has its own padding
     * sets to 0, or to that padding.
     */
    import type { Snippet } from 'svelte'
    import type { HTMLAttributes } from 'svelte/elements'

    interface Props extends HTMLAttributes<HTMLDivElement> {
        title?: string
        children?: Snippet
        /** What the person can do about it, under the text. */
        actions?: Snippet
    }

    let { title, class: className, children, actions, ...rest }: Props = $props()
</script>

<div {...rest} class={['empty-state', className]}>
    {#if title}
        <p class="title">{title}</p>
    {/if}
    {#if children}
        <p class="text">{@render children()}</p>
    {/if}
    {#if actions}
        <div class="actions">{@render actions()}</div>
    {/if}
</div>

<style lang="scss">
    .empty-state {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        margin: 0;
        padding: var(--empty-state-padding, 0.8rem);
        font-family: var(--font-ui);
        line-height: 1.4;
    }

    p {
        margin: 0;
    }

    .title {
        font-weight: 600;
    }

    .text {
        color: var(--text-muted);
        font-size: var(--fs-small);
    }

    .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-top: 0.3rem;
    }
</style>
