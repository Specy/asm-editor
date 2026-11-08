<script lang="ts">
    import EmptyState from '#cmp/shared/misc/EmptyState.svelte'
    import SegmentedControl from '#cmp/shared/input/SegmentedControl.svelte'
    import { inspectBytes } from './dataInspector'

    /**
     * The data inspector ([file-views.md](../../../../../../../docs/design/file-views.md), decision
     * 9): the bytes at the caret as integers of each width and as floating point, in the byte order
     * chosen. Beside the bytes on a wide pane, below them on a narrow one.
     */
    let {
        bytes,
        littleEndian = $bindable(true),
        side = false
    }: {
        /** The bytes from the caret on, as many as the widest reading needs or the File has. */
        bytes: Uint8Array
        littleEndian?: boolean
        side?: boolean
    } = $props()
    const rows = $derived(inspectBytes(bytes, littleEndian))

    const BYTE_ORDERS = [
        {
            id: 'little',
            label: 'Little',
            title: 'Little endian: the first byte is the least significant, as on x86'
        },
        { id: 'big', label: 'Big', title: 'Big endian: the first byte is the most significant' }
    ]
</script>

<section class="data-inspector" class:side aria-label="Data inspector">
    <header>
        <h3>Data inspector</h3>
        <SegmentedControl
            ariaLabel="Byte order"
            options={BYTE_ORDERS}
            selected={littleEndian ? 'little' : 'big'}
            onSelect={(id) => (littleEndian = id === 'little')}
        />
    </header>
    {#if bytes.length}
        <dl>
            {#each rows as row (row.label)}
                <div class="row" title={row.description}>
                    <dt>{row.label}</dt>
                    <dd class:missing={row.value === undefined}>
                        {row.value ?? '—'}
                    </dd>
                </div>
            {/each}
        </dl>
    {:else}
        <EmptyState>The File is empty.</EmptyState>
    {/if}
</section>

<style lang="scss">
    .data-inspector {
        /* its own padding is an empty state's */
        --empty-state-padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        padding: 0.5rem 0.6rem;
        border-top: 1px solid var(--wb-line, var(--tertiary));
        background: var(--secondary);
        color: var(--secondary-text);
        font-size: var(--fs-small);
        min-width: 0;
    }
    .side {
        width: 17rem;
        flex-shrink: 0;
        border-top: none;
        border-left: 1px solid var(--wb-line, var(--tertiary));
        overflow: auto;
    }
    header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
    }
    h3 {
        font-size: var(--fs-small);
        font-weight: 500;
        color: var(--text-muted);
    }
    /* a narrow pane lays the readings out in two columns, so the inspector stays short */
    dl {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(13.5rem, 1fr));
        gap: 0 1rem;
    }
    .side dl {
        grid-template-columns: 1fr;
    }
    /* a value too long to share its column with its name goes under it, whole, rather than
       breaking a number in two */
    .row {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        column-gap: 0.6rem;
        padding: 0.12rem 0;
        min-width: 0;
    }
    dt {
        color: var(--text-muted);
        font-family: var(--font-mono);
    }
    dd {
        margin-left: auto;
        font-family: var(--font-mono);
        text-align: right;
        overflow-wrap: break-word;
        min-width: 0;
        user-select: all;
    }
    /* dimmer than the muted names beside it: there is no value */
    .missing {
        opacity: 0.45;
        user-select: none;
    }
</style>
