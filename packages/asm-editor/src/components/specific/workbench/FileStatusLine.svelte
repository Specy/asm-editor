<script lang="ts" module>
    /** A length as the status lines say it: "1 byte", "4,096 bytes". */
    export const byteCount = (bytes: number) =>
        `${bytes.toLocaleString('en-US')} ${bytes === 1 ? 'byte' : 'bytes'}`
</script>

<script lang="ts">
    import type { Snippet } from 'svelte'

    /**
     * The status line of a File's view, the Hex editor's, the Preview's and the Pixel editor's
     * ([file-views.md](../../../../../docs/design/file-views.md), decision 9 and E5): the facts at
     * the left, each a `.fact` or a `Badge`, and the view's buttons at
     * the right, each a small ghost `Button` with the class `tool` and its words in a span. It sits
     * above the view, where the execution dock floating over the pane's bottom edge does not cover
     * it. Its styles reach into
     * the snippets, which are the view's own markup, so a view styles only what is its own: in a
     * `@container file-status` rule the pane width below which its buttons drop their words.
     */
    let {
        class: className,
        facts,
        tools
    }: {
        /** A class of the view's own, which its tests find the line by. */
        class?: string
        facts: Snippet
        tools?: Snippet
    } = $props()
</script>

<div class={['file-status', className]}>
    <div class="facts" aria-label="Status">{@render facts()}</div>
    {#if tools}
        <div class="tools">{@render tools()}</div>
    {/if}
</div>

<style lang="scss">
    .file-status {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        min-height: 2rem;
        padding: 0.2rem 0.3rem 0.2rem 0.6rem;
        border-bottom: 1px solid var(--line);
        background: var(--wb-section-header, var(--secondary));
        color: var(--secondary-text);
        font-size: var(--fs-small);
        container: file-status / inline-size;
    }
    .facts {
        display: flex;
        flex: 1;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.2rem 0.8rem;
        min-width: 0;
    }
    /* without buttons, which bring their own padding, as far from the right edge as the left */
    .facts:last-child {
        padding-right: 0.3rem;
    }
    .facts :global(.fact) {
        white-space: nowrap;
        color: var(--text-muted);
    }
    .tools {
        display: flex;
        flex-shrink: 0;
        gap: 0.15rem;
    }
    /* the view's buttons, small ghosts (D5), their icon beside their words, in the line's own size
       and weight of text */
    .file-status .tools :global(.tool) {
        font-size: inherit;
        font-weight: inherit;

        :global(svg) {
            width: var(--fs-caption);
            height: var(--fs-caption);
            opacity: 0.8;
        }
    }
</style>
