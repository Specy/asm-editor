<script lang="ts">
    import { X86_START_UNIT_PATH, X86_SUPPORT_UNIT_PATH } from '$lib/languages/X86/x86StartUnit'
    import { isEnvironmentHeaderPath } from '$lib/sourceRuntime/environmentLibrary'

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
        {#if path === X86_START_UNIT_PATH || path === X86_SUPPORT_UNIT_PATH}
            <!-- x86 has no Runtime library yet: this is the start code compiled programs link -->
            Start code of compiled programs, read-only.
        {:else if isEnvironmentHeaderPath(path)}
            <!-- compiled into the program's own Generated assembly, so it is no library code -->
            Environment library, &lt;sim.h&gt;, read-only.
        {:else}
            {path.endsWith('.s') ? 'Runtime library code' : 'Runtime library source'}, read-only.
        {/if}
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
