<script lang="ts">
    import FaSearch from '~icons/fa-solid/search'
    import FaMapMarkerAlt from '~icons/fa-solid/map-marker-alt'
    import FaMicroscope from '~icons/fa-solid/microscope'
    import { offsetHex } from './hexGrid'

    /**
     * The Hex editor's status line ([file-views.md](../../../../../../../docs/design/file-views.md),
     * decision 9): the caret's offset, the selection's length, the File's size, whether it has Byte
     * edits and why it is read-only, and the region of an Executable the caret is in. It sits above
     * the bytes, where the execution dock floating over the pane's bottom edge does not cover it,
     * with the buttons that open Find, Go to offset and the data inspector, which a phone has no
     * keys for.
     */
    let {
        offset,
        selection,
        size,
        digits,
        readOnly,
        region,
        inspectorOpen,
        onFind,
        onGoTo,
        onToggleInspector
    }: {
        /** The caret's, or undefined in an empty File. */
        offset: number | undefined
        /** How many bytes are selected, 0 for none. */
        selection: number
        size: number
        digits: number
        /** Why the bytes cannot be typed over now, or undefined when they can. */
        readOnly: string | undefined
        /** The name of the Executable's region the caret is in. */
        region: string | undefined
        inspectorOpen: boolean
        onFind: () => void
        onGoTo: () => void
        onToggleInspector: () => void
    } = $props()
    const count = (bytes: number) =>
        `${bytes.toLocaleString('en-US')} ${bytes === 1 ? 'byte' : 'bytes'}`
</script>

<div class="hex-status">
    <div class="facts" aria-label="Status">
        {#if offset !== undefined}
            <span
                class="fact offset"
                title="The caret's offset, in decimal: {offset.toLocaleString('en-US')}"
                >Offset <b>0x{offsetHex(offset, digits)}</b></span
            >
        {/if}
        {#if selection > 0}
            <span class="fact">{count(selection)} selected</span>
        {/if}
        <span class="fact">{count(size)}</span>
        {#if region}
            <span class="fact region">{region}</span>
        {/if}
        {#if readOnly}
            <span class="fact badge read-only" title={readOnly}>read-only</span>
        {/if}
    </div>
    <div class="tools">
        <button type="button" class="tool" title="Find bytes or text (Ctrl+F)" onclick={onFind}>
            <FaSearch /><span>Find</span>
        </button>
        <button type="button" class="tool" title="Go to offset (Ctrl+G)" onclick={onGoTo}>
            <FaMapMarkerAlt /><span>Go to</span>
        </button>
        <button
            type="button"
            class="tool"
            title="Data inspector: the bytes at the caret as numbers"
            aria-pressed={inspectorOpen}
            onclick={onToggleInspector}
        >
            <FaMicroscope /><span>Inspector</span>
        </button>
    </div>
</div>

<style lang="scss">
    .hex-status {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        min-height: 2rem;
        padding: 0.2rem 0.3rem 0.2rem 0.6rem;
        border-bottom: 1px solid var(--wb-line, var(--tertiary));
        background: var(--wb-section-header, var(--secondary));
        color: var(--secondary-text);
        font-size: 0.8rem;
        container: hex-status / inline-size;
    }
    .facts {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.2rem 0.8rem;
        min-width: 0;
    }
    .fact {
        white-space: nowrap;
        opacity: 0.85;

        b {
            font-family: monospace;
            font-weight: normal;
            opacity: 1;
        }
    }
    .offset b {
        display: inline-block;
        /* The 0x prefix and six hex digits, without padding the displayed offset. */
        min-width: 8ch;
    }
    .region {
        font-family: monospace;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 14rem;
    }
    .badge {
        padding: 0.05rem 0.4rem;
        border-radius: 0.6rem;
        background: color-mix(in srgb, var(--accent) 18%, transparent);
        opacity: 1;
    }
    .read-only {
        background: color-mix(in srgb, var(--secondary-text) 14%, transparent);
    }
    .tools {
        display: flex;
        flex-shrink: 0;
        gap: 0.15rem;
    }
    .tool {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        height: 1.6rem;
        padding: 0 0.5rem;
        border-radius: 0.3rem;
        background: transparent;
        color: inherit;
        font: inherit;
        cursor: pointer;

        :global(svg) {
            width: 0.75rem;
            height: 0.75rem;
            opacity: 0.8;
        }
        &:hover {
            background: color-mix(in srgb, var(--tertiary) 55%, transparent);
        }
        &:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: -2px;
        }
        &[aria-pressed='true'] {
            background: var(--accent);
            color: var(--accent-text);
        }
    }
    /* a narrow pane keeps the buttons' icons and drops their words */
    @container hex-status (max-width: 30rem) {
        .tool span {
            display: none;
        }
    }
</style>
