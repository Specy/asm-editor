<script lang="ts">
    /**
     * Above a Runtime library member: what it is, and its C source beside it. The library is not
     * the Project's, so nothing here can be edited.
     */
    let {
        path,
        onShowSource
    }: {
        path: string
        /** Opens the C source in the other pane; absent when the member has none or it is open. */
        onShowSource?: () => void
    } = $props()
</script>

<div class="library-notice" role="status">
    <span>
        {path.endsWith('.s') ? 'Runtime library code' : 'Runtime library source'}, read-only.
    </span>
    {#if onShowSource}
        <button onclick={onShowSource}>Show C source</button>
    {/if}
</div>

<style lang="scss">
    .library-notice {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        padding: 0.45rem 0.75rem;
        color: var(--secondary-text);
        border-bottom: 1px solid var(--wb-line);
        background: color-mix(in srgb, var(--accent2, var(--accent)) 10%, var(--secondary));
        font-size: 0.8rem;
    }

    button {
        padding: 0.2rem 0.6rem;
        border: 0;
        border-radius: 0.3rem;
        color: var(--accent-text);
        background: var(--accent);
        cursor: pointer;
        font-size: 0.75rem;
    }
</style>
