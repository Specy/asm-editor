<script lang="ts">
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
</script>

<section class="data-inspector" class:side aria-label="Data inspector">
    <header>
        <h3>Data inspector</h3>
        <div class="byte-order" role="group" aria-label="Byte order">
            <button
                type="button"
                aria-pressed={littleEndian}
                title="Little endian: the first byte is the least significant, as on x86"
                onclick={() => (littleEndian = true)}>Little</button
            >
            <button
                type="button"
                aria-pressed={!littleEndian}
                title="Big endian: the first byte is the most significant"
                onclick={() => (littleEndian = false)}>Big</button
            >
        </div>
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
        <p class="empty">The File is empty.</p>
    {/if}
</section>

<style lang="scss">
    .data-inspector {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        padding: 0.5rem 0.6rem;
        border-top: 1px solid var(--wb-line, var(--tertiary));
        background: var(--secondary);
        color: var(--secondary-text);
        font-size: 0.8rem;
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
        font-size: 0.8rem;
        font-weight: 500;
        opacity: 0.85;
    }
    .byte-order {
        display: flex;
        border: 1px solid var(--wb-line, var(--tertiary));
        border-radius: 0.3rem;
        overflow: hidden;

        button {
            padding: 0.15rem 0.45rem;
            background: transparent;
            color: inherit;
            font: inherit;
            font-size: 0.75rem;
            cursor: pointer;

            &[aria-pressed='true'] {
                background: color-mix(in srgb, var(--accent) 22%, transparent);
            }
            &:focus-visible {
                outline: 2px solid var(--accent);
                outline-offset: -2px;
            }
        }
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
    .row {
        display: flex;
        justify-content: space-between;
        gap: 0.6rem;
        padding: 0.12rem 0;
        min-width: 0;
    }
    dt {
        opacity: 0.65;
        font-family: monospace;
    }
    dd {
        font-family: monospace;
        text-align: right;
        overflow-wrap: anywhere;
        user-select: all;
    }
    .missing {
        opacity: 0.45;
        user-select: none;
    }
    .empty {
        opacity: 0.7;
    }
</style>
