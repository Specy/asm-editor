<script lang="ts">
    /**
     * Over a pane showing an Executable's Pseudocode until there is some: "Decompiling…" while the
     * decompiler loads and works, and why there is none when it fails, the 30-second limit's
     * message included ([file-views.md](../../../../../docs/design/file-views.md), decision 6). The
     * Listing's own generation comes first, under the pane's Listing notices.
     */
    import type { EditorGroup } from '#lib/workbench/EditorGroup.svelte.ts'

    let { group, onRetry }: { group: EditorGroup; onRetry: () => void } = $props()
    const document = $derived(group.requestedPseudocode)
    /**
     * The Pseudocode the pane shows of the same function while it is decompiled again, after a
     * rename, a comment or an overwrite: it stays in view until the new one is ready
     * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decision
     * 22), under no "Decompiling…".
     */
    const kept = $derived.by(() => {
        const shown = group.displayedPseudocode
        return (
            shown !== document &&
            shown?.status === 'ready' &&
            shown.path === document?.path &&
            shown.fn.address === document.fn.address
        )
    })
    const fn = $derived(group.pseudocodeFunction)
    /** How the function is named: a C++ one by its short name, as lists show it. */
    const name = $derived(fn?.list ?? fn?.name)
</script>

{#if group.pseudocodeListing?.status === 'ready'}
    {#if !fn}
        <div class="pseudocode-status" role="status">
            <h2>No Pseudocode</h2>
            <p>The Listing of {group.pseudocodeListing.name} has no function to decompile.</p>
        </div>
    {:else if document?.status === 'failed'}
        <div class="pseudocode-status" role="status">
            <h2>No Pseudocode</h2>
            <p>Couldn't decompile {name}: {document.error}</p>
            <button type="button" onclick={onRetry}>Try again</button>
        </div>
    {:else if document?.status !== 'ready' && !kept}
        <!-- shown only once it takes a moment, so a quick function does not flash it -->
        <div class="pseudocode-status waiting" role="status">
            <h2>Decompiling…</h2>
            <p>
                {document?.stage === 'loading' ? 'Loading the decompiler…' : `Decompiling ${name}…`}
            </p>
            <progress aria-label="Decompiling" value="10" max="100"></progress>
        </div>
    {/if}
{/if}

<style lang="scss">
    /* as the pane's other notices over the code area */
    .pseudocode-status {
        position: absolute;
        z-index: 3;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        gap: 0.6rem;
        padding: 2rem;
        color: var(--secondary-text);
        background: var(--secondary);
        text-align: center;
    }
    p {
        max-width: 30rem;
        opacity: 0.72;
        overflow-wrap: anywhere;
    }
    progress {
        width: min(16rem, 80%);
        height: 0.5em;
        appearance: none;
        overflow: hidden;
        border-radius: 0.2rem;
        background: color-mix(in srgb, var(--secondary-text) 20%, var(--secondary));
    }
    progress::-webkit-progress-bar {
        background: color-mix(in srgb, var(--secondary-text) 20%, var(--secondary));
        border-radius: inherit;
    }
    progress::-webkit-progress-value {
        background: var(--accent);
        border-radius: inherit;
    }
    progress::-moz-progress-bar {
        background: var(--accent);
        border-radius: inherit;
    }
    button {
        margin-top: 0.75rem;
        padding: 0.4rem 0.9rem;
        border-radius: 0.4rem;
        color: var(--accent-text);
        background: var(--accent);
        cursor: pointer;
    }
    .waiting {
        animation: appears 0s 150ms both;
    }
    @keyframes appears {
        from {
            visibility: hidden;
        }
        to {
            visibility: visible;
        }
    }
</style>
