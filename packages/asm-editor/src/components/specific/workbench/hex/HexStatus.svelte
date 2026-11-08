<script lang="ts">
    import FaSearch from '~icons/fa-solid/search'
    import FaMapMarkerAlt from '~icons/fa-solid/map-marker-alt'
    import FaMicroscope from '~icons/fa-solid/microscope'
    import Button from '#cmp/shared/button/Button.svelte'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import Badge from '#cmp/shared/misc/Badge.svelte'
    import FileStatusLine, { byteCount } from '../FileStatusLine.svelte'
    import { offsetHex } from './hexGrid'

    /**
     * The Hex editor's status line ([file-views.md](../../../../../../../docs/design/file-views.md),
     * decision 9): the caret's offset, the selection's length, the File's size, whether it has Byte
     * edits and why it is read-only, and the region of an Executable the caret is in, with the
     * buttons that open Find, Go to offset and the data inspector, which a phone has no keys for.
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
</script>

<FileStatusLine class="hex-status">
    {#snippet facts()}
        {#if offset !== undefined}
            <span
                class="fact offset"
                {@attach tooltip(
                    `The caret's offset, in decimal: ${offset.toLocaleString('en-US')}`
                )}>Offset <b>0x{offsetHex(offset, digits)}</b></span
            >
        {/if}
        {#if selection > 0}
            <span class="fact">{byteCount(selection)} selected</span>
        {/if}
        <span class="fact">{byteCount(size)}</span>
        {#if region}
            <span class="fact region">{region}</span>
        {/if}
        {#if readOnly}
            <Badge class="read-only" {@attach tooltip(readOnly)}>read-only</Badge>
        {/if}
    {/snippet}
    {#snippet tools()}
        <!-- named as their words, which a narrow pane drops -->
        <Button
            kind="ghost"
            size="sm"
            class="tool"
            aria-label="Find"
            {@attach tooltip('Find bytes or text', { shortcut: 'Mod+KeyF' })}
            onClick={onFind}
        >
            <FaSearch /><span>Find</span>
        </Button>
        <Button
            kind="ghost"
            size="sm"
            class="tool"
            aria-label="Go to"
            {@attach tooltip('Go to offset', { shortcut: 'Mod+KeyG' })}
            onClick={onGoTo}
        >
            <FaMapMarkerAlt /><span>Go to</span>
        </Button>
        <Button
            kind="ghost"
            size="sm"
            class="tool"
            aria-label="Inspector"
            {@attach tooltip('Data inspector: the bytes at the caret as numbers')}
            aria-pressed={inspectorOpen}
            active={inspectorOpen}
            onClick={onToggleInspector}
        >
            <FaMicroscope /><span>Inspector</span>
        </Button>
    {/snippet}
</FileStatusLine>

<style lang="scss">
    .fact b {
        font-family: var(--font-mono);
        font-weight: normal;
        opacity: 1;
    }
    .offset b {
        display: inline-block;
        /* The 0x prefix and six hex digits, without padding the displayed offset. */
        min-width: 8ch;
    }
    .region {
        font-family: var(--font-mono);
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 14rem;
    }
    /* a narrow pane keeps the buttons' icons and drops their words */
    @container file-status (max-width: 30rem) {
        :global(.tool) span {
            display: none;
        }
    }
</style>
