<script lang="ts">
    import ValueDiff from '$cmp/specific/project/user-tools/ValueDiffer.svelte'
    import {
        defaultRegisterKind,
        type Register,
        type RegisterFormat,
        type RegisterPoke,
        RegisterSize
    } from '$lib/languages/commonLanguageFeatures.svelte'
    import {
        parseRegisterPoke,
        registerWidthBits,
        renderRegister,
        type RegisterFileRendering,
        type RenderedRegister,
        type RenderedRegisterChunk
    } from '$lib/languages/registerFormats'
    import { preferencesStore } from '$stores/preferencesStore.svelte'

    /**
     * The rows of one Register file: the grid of names and values the CPU panel has always drawn,
     * now for any file the emulator publishes. Every reading goes through `renderRegister`, so the
     * CPU file comes out byte for byte as it did before and a floating-point file gets the decoded
     * number, its lanes side by side and the other precisions in the hover.
     */
    interface Props {
        /** The file being drawn; a `RegisterFile` satisfies it, and so does the CPU panel's own. */
        file: RegisterFileRendering
        /**
         * The file's whole register array in the descriptor's order, because `renderRegister` looks
         * a row's pair, size and kind up by position. Hidden names are dropped after rendering.
         */
        registers: Register[]
        format?: RegisterFormat
        groupSize?: RegisterSize
        hiddenRegistersNames?: readonly string[]
        position?: 'top' | 'bottom'
        gridStyle?: string
        /**
         * The panel's own judgement, for a file whose rows ask for more than the register column
         * has: the column is pinned to the CPU file's width, so a file with longer names than the
         * CPU's, which MIPS's CP0 and RISC-V's CSR both have, is drawn small enough to fit it.
         */
        compact?: boolean
        onRegisterClick?: (register: Register) => void
        /**
         * Whether the rows take Pokes ([the design record](../../../../../docs/design/pokes.md)):
         * the page's half of the availability rule, which is the Emulator's `canPoke` and the
         * Project not being read only. A panel that passes nothing is read only, which is how the
         * PC row and the Testcase editor stay as they were.
         */
        pokeable?: boolean
        /** Whether that register of this file may be poked; everything is when nothing is passed. */
        canPokeRegister?: (register: string) => boolean
        /** One commit, which is one Poke: usually one write, a MIPS paired double two. */
        onPoke?: (writes: RegisterPoke[]) => void
    }

    let {
        file,
        registers,
        format = 'hex',
        groupSize = RegisterSize.Word,
        hiddenRegistersNames = [],
        position = 'top',
        gridStyle = '',
        compact = false,
        onRegisterClick,
        pokeable = false,
        canPokeRegister,
        onPoke
    }: Props = $props()

    const fileKind = $derived(defaultRegisterKind(file.formats))
    //a 128 bit register drawn in hex is 32 digits wide and a decimal float is not much narrower,
    //either of which would push the panel sideways out of its fixed column, so those rows shrink
    //and wrap instead of overflowing
    const isCompact = $derived(
        compact || Number(file.size) > RegisterSize.Double || fileKind === 'float'
    )
    const usesHex = $derived(!preferencesStore.values.useDecimalAsDefault.value)
    /** The hex digits one group takes, which is what the lines of a wide row are counted in. */
    const groupDigits = $derived(2 * Math.max(1, Math.min(Number(groupSize), Number(file.size))))
    //only a hexadecimal reading falls into lines of whole groups, because only it is counted in
    //digits: a decoded float is one text per lane with no length to line up, so its row stays the
    //wrapping flex box every other compact file uses
    const wide = $derived(Number(file.size) > RegisterSize.Double && format === 'hex')
    //a wide row lays its groups out in lines of at most sixteen digits, so a 128 bit register is
    //two lines whatever the grouping is and the register column keeps the width the other tabs
    //give it: widening it here would push the memory panel sideways whenever this tab is picked
    const wideColumns = $derived(Math.max(1, Math.floor(16 / groupDigits)))
    //no chunk of a compact row may be wider than sixteen digits, whether it is a group of 32 of
    //them (a 128 bit register grouped by Q) or a long decimal float such as -1.7976931348623157e+308:
    //the register column is as wide as what it holds, so a chunk that refused to break would push
    //the memory panel sideways every time this tab was picked. The extra width is the padding,
    //which `border-box` counts inside `max-width`.
    const chunkStyle = $derived(
        isCompact
            ? 'padding: 0.1rem; word-break: break-all; max-width: calc(16ch + 0.2rem);'
            : 'padding: 0.1rem;'
    )

    type Row = {
        register: Register
        /**
         * The register's index in the file's own array, which the renderer and `parseRegisterPoke`
         * both look a row's pair, size and kind up by: the rows are filtered after rendering, so a
         * row's position in this list is not its position in the file.
         */
        index: number
        /** An integer register is read as hex whatever the Format is, and names an address to jump to. */
        integer: boolean
        /**
         * Whether the row is showing hex digits, which every integer register is and a float one is
         * under the Hex Format. Hex is an integer Format, so this is what the hex/decimal Preference
         * applies to; a single or a double reading is always decimal.
         */
        hexadecimal: boolean
        rendered: RenderedRegister
    }

    //derived and never copied into state: a Register's value is a rune, so a refresh that writes it
    //redraws the row that shows it
    const rows: Row[] = $derived(
        registers
            .map((register, index) => {
                const integer = (file.layout[index]?.kind ?? fileKind) === 'integer'
                return {
                    register,
                    index,
                    integer,
                    hexadecimal: integer || format === 'hex',
                    rendered: renderRegister(file, registers, index, format, groupSize)
                }
            })
            .filter((row) => !hiddenRegistersNames.includes(row.register.name))
    )

    /** A hex group read as a decimal, padded to the width its digits take, as the CPU panel pads it. */
    function decimal(value: bigint, bytes: number): string {
        return `${value}`.padStart(bytes * 2, '0')
    }

    /**
     * The lines of a chunk's hover, which are whatever the row is not showing: an integer group
     * hovers its decimals, or its digits when the Preference swapped the two around, and a float
     * register hovers the readings `renderRegister` collected, the digits first when those were
     * swapped away too.
     */
    function hoverLines(row: Row, chunk: RenderedRegisterChunk): string[] {
        const group = chunk.group
        //a blanked row draws a dash and nothing else, so there is no other reading to put beside
        //the bits it is still holding
        if (row.rendered.blank) return row.rendered.hover
        if (!group) return row.rendered.hover
        if (row.integer) {
            const signed = group.value !== group.valueSigned ? [String(group.valueSigned)] : []
            return [...signed, usesHex ? decimal(group.value, group.bytes) : chunk.text]
        }
        return usesHex ? row.rendered.hover : [chunk.text, ...row.rendered.hover]
    }

    /** What a chunk draws, which is what its input opens holding. */
    function chunkText(chunk: RenderedRegisterChunk): string {
        const group = chunk.group
        return group && !usesHex ? decimal(group.value, group.bytes) : chunk.text
    }

    /** The same chunk of the previous value, which is what the change highlight diffs against. */
    function chunkPrevText(chunk: RenderedRegisterChunk): string {
        const group = chunk.group
        return group && !usesHex ? decimal(group.prevValue, group.bytes) : chunk.prevText
    }

    /**
     * The chunk being typed into, if any ([the design record](../../../../../docs/design/pokes.md)):
     * one at a time, named by the register and the chunk rather than by the row's position, so a
     * refresh that reorders nothing leaves the open input where it was. `reason` is why the last
     * commit was refused, which keeps the input open and marks it.
     */
    let editedRegister: string | null = $state(null)
    let editedIndex = $state(0)
    let editedChunk = $state(0)
    let editedText = $state('')
    /**
     * What the chunk read when the input opened, which a commit of the same text changes nothing
     * from: a reading is not always its own bits, so re-encoding one would write a value the row
     * never showed. A RISC-V register that is not NaN-boxed reads `NaN` under the Single Format,
     * and committing that back would poke the canonical NaN over bits the user only looked at.
     */
    let openedText = $state('')
    let editedReason: string | null = $state(null)

    /** Whether a row takes Pokes: the page's flag, the Emulator's answer, and a row with a value. */
    function isPokeable(row: Row): boolean {
        if (!pokeable || !onPoke) return false
        if (row.rendered.blank || row.rendered.chunks.length === 0) return false
        return canPokeRegister ? canPokeRegister(row.register.name) : true
    }

    function isEditing(row: Row, chunkIndex: number): boolean {
        return editedRegister === row.register.name && editedChunk === chunkIndex
    }

    function openInput(row: Row, chunkIndex: number, chunk: RenderedRegisterChunk) {
        editedRegister = row.register.name
        editedIndex = row.index
        editedChunk = chunkIndex
        editedText = chunkText(chunk)
        openedText = editedText
        editedReason = null
    }

    /** The input opens on the current value, selected, so that typing replaces it. */
    function selectOnOpen(node: HTMLInputElement) {
        node.focus()
        node.select()
    }

    /**
     * Enter, or clicking away, commits. A commit that leaves the value as it was calls nothing, as
     * the design record asks, and one the helper refuses keeps the input open with the reason on it
     * rather than writing a truncated value.
     */
    function commit() {
        //the input is gone already when a commit closed it, and removing it fires one last blur
        if (editedRegister === null) return
        //the text the chunk opened on is the value it is already holding, whatever bits that
        //reading came from, so committing it back is a no-op rather than a value to re-encode
        if (editedText === openedText) {
            editedRegister = null
            return
        }
        const parsed = parseRegisterPoke({
            file,
            registers,
            index: editedIndex,
            format,
            groupSize,
            chunkIndex: editedChunk,
            text: editedText,
            decimals: !usesHex
        })
        if (!parsed.ok) {
            editedReason = parsed.reason
            return
        }
        //the masking `GenericEmulator.pokeRegisters` drops a no-op write by: MIPS and RISC-V hand
        //their CPU registers back signed while a poked value is unsigned, so poking the digits the
        //row is showing would otherwise read as a change and call `onPoke` for nothing
        const changed = parsed.writes.some((write) => {
            const index = registers.findIndex((register) => register.name === write.register)
            if (index === -1) return true
            const bits = registerWidthBits(file, registers[index], index)
            return (
                BigInt.asUintN(bits, registers[index].value) !== BigInt.asUintN(bits, write.value)
            )
        })
        editedRegister = null
        //the change highlight comes from the refresh the Poke ends with, never from here
        if (changed) onPoke?.(parsed.writes)
    }

    //a Run, a Build or a read-only Project takes the rows back: an input still open over one of them
    //would take a commit the Emulator would then refuse, so it closes with the rule
    $effect(() => {
        if (!pokeable) editedRegister = null
    })

    /** Which rows are being drawn, which is what tells one file's rows from another's. */
    const rowNames = $derived(registers.map((register) => register.name).join(','))

    //the chunk index names a lane of the reading the row was drawn in, so a Format, a grouping or
    //another file's rows arriving under an open input leave it over a different lane, holding text
    //that was typed for the old one: in every case the row goes back to the value it is showing
    $effect(() => {
        void format
        void groupSize
        void rowNames
        editedRegister = null
    })

    function onChunkKey(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            event.preventDefault()
            commit()
        } else if (event.key === 'Escape') {
            event.preventDefault()
            editedRegister = null
        }
    }
</script>

<!--
    one chunk as it is read: the value, the previous one behind the change highlight, and the
    readings the row is not showing in the hover. A pokeable chunk is the same cell inside a button
-->
{#snippet chunkCell(row: Row, chunk: RenderedRegisterChunk, rowPosition: 'top' | 'bottom')}
    {@const group = chunk.group}
    {@const lines = hoverLines(row, chunk)}
    <ValueDiff
        monospaced
        hoverElementStyle="left: 50%; transform: translateX(-50%);{rowPosition === 'bottom'
            ? 'bottom: var(--top); top: unset;'
            : ''}"
        style="{chunkStyle}{row.rendered.blank ? ' opacity: 0.4;' : ''}"
        hoverValueElementStyle={group && group.bytes * 2 > RegisterSize.Long * 2
            ? 'font-size: 0.95rem'
            : ''}
        value={chunkText(chunk)}
        diff={chunkPrevText(chunk)}
        hoverElementOffset={`${-1.25 * Math.max(1, lines.length)}rem`}
    >
        {#snippet hoverValue()}
            <div class="column">
                {#each lines as line, lineIndex (lineIndex)}
                    <div style="user-select: all;">
                        {line}
                    </div>
                {/each}
            </div>
        {/snippet}
    </ValueDiff>
{/snippet}

<div
    class="registers"
    class:compact={isCompact}
    class:wide
    style="{gridStyle}; --wide-columns: {wideColumns};"
>
    {#each rows as row, rowIndex (row.register.name)}
        <!--
            the top row's hover opens downward whatever the caller asked for: upward it would be
            drawn into the header above the list, where the scrolling region clips it away and the
            reader is left with a value they cannot read
        -->
        {@const rowPosition = rowIndex === 0 ? 'bottom' : position}
        <div class="register-wrapper">
            <div class="hover-register-value">
                {#if !row.hexadecimal}
                    0x{row.register.toHex()}
                {:else if usesHex}
                    {row.register.value}
                {:else}
                    {row.register.value.toString(16).padStart(8, '0')}
                {/if}
            </div>
            {#if row.integer && onRegisterClick}
                <button class="register-name" onclick={() => onRegisterClick(row.register)}>
                    {row.register.name.toUpperCase()}
                </button>
            {:else}
                <span class="register-name register-name-static">
                    {row.register.name.toUpperCase()}
                </span>
            {/if}
        </div>
        <div class="register-hex">
            {#if row.rendered.chunks.length === 0}
                <!-- the odd row of a paired-doubles file, which MARS leaves empty too -->
                <div class="blank-register">-</div>
            {:else}
                <!--
                    a blanked row has one chunk, the dash, and is drawn faint through the chunk's
                    own style rather than the cell's, so that the bits it still holds stay readable
                    in the hover above it
                -->
                {#each row.rendered.chunks as chunk, chunkIndex (chunkIndex)}
                    {#if !isPokeable(row)}
                        {@render chunkCell(row, chunk, rowPosition)}
                    {:else if isEditing(row, chunkIndex)}
                        <!--
                            the chunk being poked, sized to the text it opened on so the row does
                            not jump, and marked when the last commit was refused
                        -->
                        <input
                            class="chunk-input"
                            class:refused={editedReason !== null}
                            title={editedReason ?? ''}
                            aria-label="Poke {row.register.name}"
                            style="width: calc({Math.max(editedText.length, 2)}ch + 0.2rem);"
                            bind:value={editedText}
                            use:selectOnOpen
                            onkeydown={onChunkKey}
                            oninput={() => (editedReason = null)}
                            onblur={commit}
                        />
                    {:else}
                        <button
                            class="chunk-button"
                            title="Poke {row.register.name}"
                            onclick={() => openInput(row, chunkIndex, chunk)}
                        >
                            {@render chunkCell(row, chunk, rowPosition)}
                        </button>
                    {/if}
                {/each}
            {/if}
        </div>
    {/each}
</div>

<style lang="scss">
    .registers {
        height: fit-content;
        display: grid;
        grid-template-columns: min-content 1fr;
        grid-template-rows: auto;
        flex-direction: column;
        gap: 0.22rem;
        padding: 0.4rem 0.2rem;
        font-size: 1rem;
        @media screen and (max-width: 1000px) {
            width: unset;
        }
    }

    //a float reading and a 128 bit hex value are both far wider than the 32 bit groups the panel was
    //drawn for, so their rows give up the single-line height and wrap inside the column
    .compact {
        font-size: 0.8rem;

        .register-wrapper,
        .register-hex {
            max-height: unset;
        }

        .register-hex {
            flex-wrap: wrap;
            //the groups spread across the row rather than bunching at its start: a compact file is
            //drawn narrow because its names are long, and the space it saves belongs to the value
            justify-content: space-around;
            row-gap: 0.1rem;
        }
    }

    //only the hexadecimal Format of a register wider than 64 bits: the groups fall into lines of
    //sixteen digits, which is two lines for a 128 bit register, inside the width the other tabs of
    //the panel already have. The column is sized by what it holds, so a wider tab would move the
    //memory panel beside it every time it was picked
    .wide {
        font-size: 0.75rem;

        .register-hex {
            display: grid;
            grid-template-columns: repeat(var(--wide-columns, 2), auto);
        }
    }

    .hover-register-value {
        display: none;
        min-width: 100%;
        background-color: var(--tertiary);
        color: var(--tertiary-text);
        border-radius: 0.2rem;
        position: absolute;
        cursor: text;
        user-select: all;
        font-family: monospace;
        font-size: 1rem;
        box-shadow: rgba(0, 0, 0, 0.4) 0px 0px 6px;
        left: 100%;
        z-index: 3;
        top: 0;
        height: 100%;
        padding: 0 0.3rem;
        align-items: center;
        font-weight: normal;
        white-space: nowrap;
    }

    .register-wrapper {
        max-height: 1.35rem;
        display: flex;
        justify-content: center;
        align-items: center;
        position: relative;

        &:hover .hover-register-value {
            display: flex;
        }
    }

    .register-name {
        font-weight: bold;
        //a shade under the digits beside it, and in `em` rather than `rem` so it still shrinks with
        //the row: a button does not inherit the font size on its own (the browser gives it one of
        //its own), and without that a `.compact` file kept full-sized names beside its shrunken
        //values and asked the register column for more width than the CPU file, which is the one
        //file the column is sized from
        font-size: 0.9em;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0.2rem;
        font-family: Rubik;
        border-radius: 0.2rem;
        border: none;
        min-width: 1.6rem;
        background: transparent;
        color: var(--secondary-text);
        cursor: pointer;
        text-align: center;

        &:hover {
            background-color: var(--accent2);
            color: var(--accent2-text);
        }
    }

    //a floating-point register names no address to jump to, so its name is a label and not a button
    .register-name-static {
        cursor: default;

        &:hover {
            background-color: transparent;
            color: var(--secondary-text);
        }
    }

    .register-hex {
        display: flex;
        max-height: 1.35rem;
        justify-content: space-around;
        padding-left: 0.2rem;
        gap: 0.1rem;
        flex: 1;
        height: 100%;
        border-left: solid 0.1rem var(--tertiary);
    }

    //a pokeable chunk is the cell it always was, inside a button that carries the click: the styling
    //is the cell's, so a row reads the same whether it takes Pokes or not
    .chunk-button {
        all: unset;
        cursor: pointer;
        display: block;
        border-radius: 0.2rem;

        //the cell inside it draws its own cursor, which is the read-only one
        :global(.tooltip-base) {
            cursor: pointer;
        }

        &:focus-visible {
            outline: solid 0.1rem var(--accent);
        }
    }

    //the input the chunk becomes while it is being poked, drawn in the row's own monospace so the
    //digits stay where they were
    .chunk-input {
        font-family: monospace;
        font-size: inherit;
        text-align: center;
        //the box the read-only cell has, digit for digit: `box-sizing: border-box` is global, so
        //the padding the widths below carry is inside them and the text still gets its own `ch` per
        //character. The frame is an outline drawn inside that box rather than a border, because a
        //border is layout and would widen the cell and shift the row the moment the input opened.
        padding: 0.1rem;
        min-width: calc(2ch + 0.2rem);
        //the cap the read-only cell beside it gets, for the same reason: the register column is as
        //wide as what it holds, so an input that grew with a long typed value would push the memory
        //panel sideways
        max-width: calc(16ch + 0.2rem);
        outline: solid 0.1rem var(--accent);
        outline-offset: -0.1rem;
        border-radius: 0.2rem;
        background-color: var(--primary);
        color: var(--primary-text);
    }

    //a commit the helper refused: the input keeps what was typed and says why in its title
    .refused {
        outline-color: var(--red);
    }

    .blank-register {
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 1;
        opacity: 0.4;
        font-family: monospace;
    }
</style>
