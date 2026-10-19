<script lang="ts">
    import { X86_START_UNIT_PATH, X86_SUPPORT_UNIT_PATH } from '#lib/languages/X86/x86StartUnit.ts'
    import { isEnvironmentHeaderPath } from '#lib/sourceRuntime/environmentLibrary.ts'
    import ReadOnlyNotice from './ReadOnlyNotice.svelte'

    /**
     * Over a Runtime library member: what it is, and its C source beside it. The library is not
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
    const label = $derived(
        path === X86_START_UNIT_PATH || path === X86_SUPPORT_UNIT_PATH
            ? 'Start code of compiled programs, read-only.'
            : isEnvironmentHeaderPath(path)
              ? 'Environment library, <sim.h>, read-only.'
              : `${path.endsWith('.s') ? 'Runtime library code' : 'Runtime library source'}, read-only.`
    )
</script>

{#snippet showSource()}
    <button onclick={onShowSource}>Show C source</button>
{/snippet}

<ReadOnlyNotice {label} action={onShowSource ? showSource : undefined} />

<style lang="scss">
    button {
        padding: 0.2rem 0.6rem;
        border: 0;
        border-radius: 0.3rem;
        color: var(--secondary-text);
        background: var(--secondary);
        cursor: pointer;
        font-size: inherit;

        &:hover {
            color: var(--tertiary-text);
            background: var(--tertiary);
        }

        &:focus-visible {
            outline: 2px solid currentColor;
            outline-offset: 2px;
        }
    }
</style>
