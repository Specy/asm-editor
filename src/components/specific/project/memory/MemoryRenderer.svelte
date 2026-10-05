<script lang="ts">
    import Button from '$cmp/shared/button/Button.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import ValueDiff from '$cmp/specific/project/user-tools/ValueDiffer.svelte'
    import MdTextFields from '~icons/ic/baseline-text-fields'
    import FaTimes from '~icons/fa-solid/times'
    import FaExclamationTriangle from '~icons/fa-solid/exclamation-triangle'
    import { onMount } from 'svelte'
    import {
        findElInTree,
        getNumberInRange,
        goesNextLineBy,
        inRange,
        isMemoryChunkEqual,
        type MemoryReading,
        parseMemoryPoke
    } from '$cmp/specific/project/memory/memoryTabUtils'
    import Row from '$cmp/shared/layout/Row.svelte'
    import {
        type ColorizedLabel,
        type DiffedMemory,
        RegisterSize
    } from '$lib/languages/commonLanguageFeatures.svelte'
    import { unsignedBigIntToSigned } from '$lib/utils'

    const id = Math.random().toString(36).substring(8)

    const DisplayType = {
        Hex: 'Hex',
        Char: 'Char',
        Decimal: 'Decimal'
    } as const

    interface Props {
        memory: DiffedMemory
        currentAddress: bigint
        callStackAddresses?: ColorizedLabel[]
        sp: bigint
        pageSize: number
        bytesPerRow: number
        style?: string
        defaultMemoryValue: number
        endianess: 'big' | 'little'
        systemSize: RegisterSize
        /**
         * The highest address there is: every address is padded to its digits, so the address
         * column keeps one width whichever page is shown. Without it they pad to four.
         */
        memorySize?: bigint
        /** The Workbench's narrower page: smaller digits in tighter cells. */
        dense?: boolean
        /**
         * Whether the bytes take Pokes ([the design record](../../../../../docs/design/pokes.md)):
         * the page's half of the availability rule, which is the Emulator's `canPoke` and the
         * Project being neither read only nor busy. A panel that passes nothing is read only, and
         * its selection popup is the reading it has always been.
         */
        pokeable?: boolean
        /** One commit of the selection, which is one Poke however many bytes it holds. */
        onPoke?: (address: bigint, bytes: Uint8Array) => void
    }

    let {
        memory,
        currentAddress,
        sp,
        pageSize,
        bytesPerRow,
        style = '',
        defaultMemoryValue,
        endianess,
        callStackAddresses = [],
        systemSize,
        memorySize,
        dense = false,
        pokeable = false,
        onPoke
    }: Props = $props()
    const maxAddresses = systemSize
    const addressDigits = $derived(memorySize ? memorySize.toString(16).length : 4)
    let selectedAddressesIndexes = $state({
        start: -1,
        len: 0
    })
    let selectingAddresses = $state(false)

    let type = $state(DisplayType.Hex) as (typeof DisplayType)[keyof typeof DisplayType]
    let visibleAddresses = $derived(
        new Array(pageSize / bytesPerRow)
            .fill(0)
            .map((_, i) => currentAddress + BigInt(i * bytesPerRow))
    )

    onMount(() => {
        const deselect = () => {
            selectingAddresses = false
        }
        const selectFn = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                selectingAddresses = false
                selectedAddressesIndexes.start = -1
                selectedAddressesIndexes.len = 0
            }
        }
        window.addEventListener('blur', deselect)
        window.addEventListener('keydown', selectFn)
        window.addEventListener('pointerup', deselect)
        return () => {
            window.removeEventListener('blur', deselect)
            window.removeEventListener('keydown', selectFn)
            window.removeEventListener('pointerup', deselect)
        }
    })

    function getTextFromValue(
        value: bigint,
        padding?: number,
        typeOverride?: (typeof DisplayType)[keyof typeof DisplayType]
    ) {
        switch (typeOverride ?? type) {
            case DisplayType.Hex:
                return value
                    .toString(16)
                    .padStart(padding ?? 0, '0')
                    .toUpperCase()
            case DisplayType.Char:
                //hides last extended ascii to have prettier view
                return value === BigInt(defaultMemoryValue)
                    ? '.'
                    : String.fromCharCode(Number(value))
            case DisplayType.Decimal:
                return value.toString().padStart(padding ?? 2, '0')
            default:
                return value.toString()
        }
    }

    function onPointerDown(e: PointerEvent) {
        selectingAddresses = true
        const el = findElInTree(e.target as HTMLElement, id)
        if (!el) return
        const index = parseInt(el.id.split('-')[1])
        if (isNaN(index)) return
        //clicking away commits, and this is where the click is: the browser moves the selection
        //here and only blurs the input when the pointerdown's default action runs, by which time
        //the effect below has already put the popup back to the bytes
        commitPoke()
        selectedAddressesIndexes.start = index
        selectedAddressesIndexes.len = 0
    }

    let lastIdx = -1

    function handlePointerMove(e: PointerEvent) {
        if (!selectingAddresses) return
        const el = findElInTree(e.target as HTMLElement, id)
        if (!el) return
        const index = parseInt(el.id.split('-')[1])
        if (isNaN(index)) return
        if (lastIdx === index && selectedAddressesIndexes.start !== -1) return
        lastIdx = index
        //a drag moves the selection away from what was typed, which is a commit like any other
        commitPoke()
        if (selectedAddressesIndexes.start === -1) {
            selectedAddressesIndexes.start = index
            selectedAddressesIndexes.len = 0
        } else {
            selectedAddressesIndexes.len = index - selectedAddressesIndexes.start
            if (selectedAddressesIndexes.len < 0) {
                selectedAddressesIndexes.len = Math.max(
                    selectedAddressesIndexes.len,
                    -maxAddresses + 1
                )
            } else {
                selectedAddressesIndexes.len = Math.min(
                    selectedAddressesIndexes.len,
                    maxAddresses - 1
                )
            }
            if (selectedAddressesIndexes.len <= -1 || selectedAddressesIndexes.len >= 1) {
                window.getSelection()?.removeAllRanges()
            }
        }
    }

    //the selected run as the panel writes it: the lower of the two ends, since a selection dragged
    //backwards keeps its anchor in `start`, and the count of bytes it covers
    const selectionStart = $derived(
        Math.min(
            selectedAddressesIndexes.start,
            selectedAddressesIndexes.start + selectedAddressesIndexes.len
        )
    )
    const selectionLength = $derived(
        selectedAddressesIndexes.start === -1 ? 0 : Math.abs(selectedAddressesIndexes.len) + 1
    )
    /**
     * The bytes the Core could not read, which hold no value: each is drawn as `??`, the page says
     * why below the grid, and a selection that covers one reads as nothing and takes no Poke.
     */
    const unreadable = $derived(memory.unreadable ?? null)
    const unreadableCount = $derived(
        unreadable ? unreadable.mask.reduce((count, byte) => count + byte, 0) : 0
    )
    const selectionUnreadable = $derived(
        unreadable !== null &&
            selectionLength > 0 &&
            unreadable.mask.subarray(selectionStart, selectionStart + selectionLength).includes(1)
    )
    const pokeReading: MemoryReading = $derived(
        type === DisplayType.Hex ? 'hex' : type === DisplayType.Char ? 'char' : 'decimal'
    )

    /**
     * The text typed into the selection popup ([the design record](../../../../../docs/design/pokes.md)):
     * null while nobody is typing, when the popup's input shows the selection's own reading and a
     * refresh that changes the bytes changes what it holds. `pokeReason` is why the last commit was
     * refused, which keeps what was typed and marks the input.
     */
    let pokeText: string | null = $state(null)
    let pokeReason: string | null = $state(null)
    /**
     * The run the open input belongs to, taken when the first character is typed: clicking another
     * byte moves the selection and only then blurs the input, so a commit that read the selection
     * would land at the byte that was clicked rather than at the one that was typed into.
     */
    let pokeAnchor: { address: bigint; bytes: Uint8Array } | null = $state(null)

    /** The input goes back to showing what memory holds, whatever was being typed into it. */
    function cancelPoke() {
        pokeText = null
        pokeReason = null
        pokeAnchor = null
    }

    //a new selection, or a new reading of it, is a new value to read, and a Run or a Build taking
    //the Core takes the input away entirely: in every case the popup goes back to the bytes
    $effect(() => {
        void selectedAddressesIndexes.start
        void selectedAddressesIndexes.len
        void pokeable
        void type
        cancelPoke()
    })

    /**
     * How the popup reads one selected run: a single byte in the reading its own cell shows, a
     * longer selection as the number of the run the popup has always shown. A byte in character
     * mode reads as the character itself and not as the dot the grid draws for untouched memory,
     * because the input is committed back as it stands and a dot would poke a `$2E`.
     */
    function selectionReading(value: bigint): string {
        if (selectionLength !== 1) return value.toString()
        switch (type) {
            case DisplayType.Hex:
                return value.toString(16).padStart(2, '0').toUpperCase()
            case DisplayType.Char:
                return String.fromCharCode(Number(value))
            default:
                return value.toString()
        }
    }

    /**
     * Enter, or clicking away, commits the whole selection as one Poke, in the panel's endianness.
     * A commit that leaves the bytes as they were calls nothing, as the design record asks, and one
     * that does not fit the selection keeps the input open with the reason on it rather than
     * writing a truncated value.
     */
    function commitPoke() {
        //nothing was typed since the popup last showed the bytes, so there is nothing to commit
        if (pokeText === null || pokeAnchor === null || !pokeable || !onPoke) return
        const anchor = pokeAnchor
        const parsed = parseMemoryPoke(pokeText, anchor.bytes.length, endianess, pokeReading)
        if (!parsed.ok) {
            pokeReason = parsed.reason
            return
        }
        cancelPoke()
        if (isMemoryChunkEqual(anchor.bytes, parsed.bytes)) return
        //the change highlight comes from the refresh the Poke ends with, never from here
        onPoke(anchor.address, parsed.bytes)
    }

    /** The run being typed into, taken as it stands the moment the typing starts. */
    function anchorPoke() {
        if (pokeAnchor !== null || selectionLength <= 0 || selectionUnreadable) return
        pokeAnchor = {
            address: currentAddress + BigInt(selectionStart),
            bytes: memory.current.slice(selectionStart, selectionStart + selectionLength)
        }
    }

    function onPokeKey(e: KeyboardEvent) {
        if (e.key === 'Enter') {
            e.preventDefault()
            commitPoke()
        } else if (e.key === 'Escape') {
            //Escape ends the selection from anywhere in the window; while the input has the focus
            //it is the input it cancels, so the selection stays and the bytes can be read again
            e.preventDefault()
            e.stopPropagation()
            cancelPoke()
            ;(e.currentTarget as HTMLInputElement).blur()
        }
    }

    function getColorOfAddress(address: bigint) {
        let last: { color?: string; address: bigint } = {
            address: -1n
        }
        for (const frame of callStackAddresses) {
            if (address >= frame.sp) {
                last = frame
                break
            }
        }
        return last?.color
    }
</script>

<div class="memory-grid" class:dense style={`--bytesPerRow: ${bytesPerRow}; ${style}`}>
    <div class="memory-offsets">
        {#each new Array(bytesPerRow).keys() as offset (offset)}
            <div>
                {getTextFromValue(BigInt(offset), 2, DisplayType.Hex)}
            </div>
        {/each}
    </div>
    <div class="memory-addresses">
        <Row
            padding="0.25rem"
            gap="0.2rem"
            style="height:2rem; min-width: var(--address-header-width); padding-bottom: 0; padding-right: 0.25rem;"
        >
            <Button
                title={type === DisplayType.Hex ? 'Show as character' : 'Show as hex'}
                style="padding: 0.2rem; border-radius: 0.35rem; height:100%; width: 100%"
                onClick={() =>
                    (type = type === DisplayType.Hex ? DisplayType.Char : DisplayType.Hex)}
                active={type === DisplayType.Char}
                cssVar="accent2"
            >
                <Icon size={dense ? 0.8 : 1}>
                    <MdTextFields />
                </Icon>
            </Button>
            {#if selectedAddressesIndexes.start !== -1}
                <Button
                    cssVar="green"
                    style="padding: 0.2rem; border-radius: 0.35rem; height:100%; width: 100%"
                    onClick={() => {
                        selectingAddresses = false
                        selectedAddressesIndexes.start = -1
                        selectedAddressesIndexes.len = 0
                    }}
                >
                    <Icon size={dense ? 0.8 : 1}>
                        <FaTimes />
                    </Icon>
                </Button>
            {/if}
        </Row>
        {#each visibleAddresses as address (address)}
            <div class="memory-grid-address">
                {getTextFromValue(address, addressDigits, DisplayType.Hex)}
            </div>
        {/each}
    </div>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="memory-numbers"
        onpointerdown={onPointerDown}
        ondragstart={(e) => e.preventDefault()}
        onpointermove={selectingAddresses ? handlePointerMove : undefined}
    >
        {#each memory.current as word, i (currentAddress + BigInt(i))}
            {@const signed = unsignedBigIntToSigned(BigInt(word), 1)}
            {@const selectionValue = getNumberInRange(
                memory,
                selectedAddressesIndexes.start,
                selectedAddressesIndexes.len,
                endianess
            )}
            {@const overflowsBy = goesNextLineBy(
                selectedAddressesIndexes.start,
                selectedAddressesIndexes.len,
                bytesPerRow
            )}
            <div class="memory-number">
                {#if i === selectedAddressesIndexes.start}
                    {@const signedSelection = unsignedBigIntToSigned(
                        selectionValue.current,
                        selectionValue.len
                    )}
                    <div
                        class="selection-value"
                        style={`
								${i > pageSize - bytesPerRow - 1 ? 'bottom' : 'top'}: calc(100% + 0.1rem);
								left: ${overflowsBy.overflows ? `calc(-${overflowsBy.by} * 100%)` : '0'};
								min-width: calc(${selectionValue.len} * 100%);
						`}
                    >
                        {#if selectionUnreadable}
                            <div title={unreadable?.reason}>??</div>
                        {:else if selectionValue.current !== signedSelection}
                            <div style="user-select: all;">
                                {signedSelection}
                            </div>
                        {/if}
                        {#if selectionUnreadable}
                            <!-- nothing to read, and nothing a Poke could be written over -->
                        {:else if pokeable && onPoke}
                            <!--
                                the popup is the input while the panel takes Pokes: it holds what
                                the selection reads as, and its previous-value line is drawn in the
                                same reading so the two can be compared
                            -->
                            {@const text = pokeText ?? selectionReading(selectionValue.current)}
                            <input
                                class="selection-input"
                                class:refused={pokeReason !== null}
                                title={pokeReason ??
                                    `Poke ${selectionValue.len} byte${selectionValue.len === 1 ? '' : 's'}`}
                                aria-label="Poke memory"
                                style={`width: calc(${Math.max(text.length, 2)}ch + 0.2rem);`}
                                value={text}
                                oninput={(e) => {
                                    anchorPoke()
                                    pokeText = e.currentTarget.value
                                    pokeReason = null
                                }}
                                onkeydown={onPokeKey}
                                onblur={commitPoke}
                                onpointerdown={(e) => e.stopPropagation()}
                            />
                            <div style="color: var(--accent); user-select: all">
                                {selectionReading(selectionValue.prev)}
                            </div>
                        {:else}
                            <div style="user-select: all;">
                                {selectionValue.current}
                            </div>
                            <div style="color: var(--accent); user-select: all">
                                {selectionValue.prev}
                            </div>
                        {/if}
                    </div>
                {/if}
                {#if unreadable?.mask[i]}
                    <div
                        class="unreadable-byte"
                        title={unreadable.reason}
                        style={inRange(
                            i,
                            selectedAddressesIndexes.start,
                            selectedAddressesIndexes.len
                        )
                            ? 'background-color: var(--green); color: var(--green-text);'
                            : ''}
                    >
                        ??
                    </div>
                {:else}
                    <ValueDiff
                        value={getTextFromValue(BigInt(word), 0, type)}
                        id={`${id}-${i}`}
                        diff={getTextFromValue(
                            BigInt(memory.prevState[i] ?? defaultMemoryValue),
                            0,
                            type
                        )}
                        hasSoftDiff={word !== defaultMemoryValue}
                        hoverElementStyle="width: 100%; min-width: fit-content; left: 50%; transform: translateX(-50%);"
                        style={`padding: 0.3rem var(--cell-pad-x); min-width: calc(var(--cell-pad-x) * 2 + 2ch); height: calc(2ch + 0.65rem);
                    ${
                        currentAddress + BigInt(i) === sp
                            ? ' background-color: var(--accent2); color: var(--accent2-text);'
                            : 'border-radius: 0;'
                    }
										${
                                            inRange(
                                                i,
                                                selectedAddressesIndexes.start,
                                                selectedAddressesIndexes.len
                                            )
                                                ? 'background-color: var(--green); color: var(--green-text);'
                                                : ''
                                        }
                    ${
                        getColorOfAddress(currentAddress + BigInt(i))
                            ? `color: ${getColorOfAddress(currentAddress + BigInt(i))}`
                            : ''
                    }
								`}
                        hoverElementOffset={BigInt(word) !== signed ? '-2.2rem' : '-1rem'}
                        monospaced
                    >
                        {#snippet hoverValue()}
                            <div>
                                {#if BigInt(word) !== signed}
                                    <div style="user-select: all;">
                                        {signed}
                                    </div>
                                {/if}
                                <div style="user-select: all">
                                    {word}
                                </div>
                            </div>
                        {/snippet}
                    </ValueDiff>
                {/if}
            </div>
        {/each}
    </div>
    {#if unreadable && unreadableCount > 0}
        <div class="memory-unreadable" class:partial={unreadableCount < pageSize} role="status">
            <Icon size={0.9}>
                <FaExclamationTriangle />
            </Icon>
            <span>
                {unreadableCount === pageSize
                    ? 'Nothing on this page can be read'
                    : `${unreadableCount} of ${pageSize} bytes can't be read`}: {unreadable.reason}
            </span>
        </div>
    {/if}
</div>

<style lang="scss">
    .memory-selection-cancel {
        position: absolute;
        bottom: 0rem;
        right: 0rem;
        display: flex;
        justify-content: center;
        align-items: center;
        background-color: var(--green);
        color: var(--green-text);
    }

    //the value fills its cell, so that in a page stretched taller than its rows need, a
    //Playground's, it is centred beside its address and a highlighted byte still covers the cell
    .memory-number {
        position: relative;
        display: flex;
        flex-direction: column;

        > :global(div:has(> .tooltip-base)) {
            display: flex;
            flex-direction: column;
            flex: 1;
        }

        :global(.tooltip-base) {
            flex: 1;
        }
    }

    .selection-value {
        background-color: var(--primary);
        color: var(--primary-text);
        position: absolute;
        z-index: 2;
        text-align: center;
        border-radius: 0.3rem;
        box-shadow: 0 0 0.3rem var(--primary);
        padding: 0.3rem;
    }

    //the input the selection popup becomes while it is being poked, in the panel's own monospace
    //so the digits sit where the popup drew them
    .selection-input {
        font-family: monospace;
        font-size: inherit;
        text-align: center;
        align-self: center;
        //`box-sizing: border-box` is global, so the padding is inside the width the popup sets and
        //the text keeps its own `ch` per character. The frame is an outline drawn inside that box
        //rather than a border, which is layout and would squeeze the digits it draws around.
        padding: 0 0.1rem;
        min-width: calc(2ch + 0.2rem);
        outline: solid 0.1rem var(--accent);
        outline-offset: -0.1rem;
        border-radius: 0.2rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
    }

    //a commit that does not fit the selection: the input keeps what was typed and says why
    .refused {
        outline-color: var(--red);
    }

    .memory-grid {
        display: grid;
        position: relative;
        font-family: monospace;
        font-size: 1rem;
        grid-template-columns: min-content;
        grid-template-rows: min-content;
        grid-template-areas:
            'b a a a a'
            'b c c c c'
            'b c c c c'
            'b c c c c'
            'b c c c c';
        background-color: var(--tertiary);
        color: var(--tertiary-text);
        //a host that squares its panels, the Workbench's Lines, squares this one too
        border-radius: var(--panel-radius, 0.5rem);
        padding-right: 0.3rem;
        padding-bottom: 0.3rem;
        --cell-pad-x: 0.3rem;
        --address-header-width: 3.8rem;
    }

    //the cells' sizes are in `ch` and follow the smaller font, as the addresses' do; the rest is
    //their padding, and the address column's header, which fits the hex toggle and the selection's
    //clear button side by side so selecting never widens the column
    .dense {
        font-size: 0.875rem;
        --cell-pad-x: 0.25rem;
        --address-header-width: 3.1rem;

        .memory-grid-address {
            padding: 0 0.35rem;
        }
    }

    //why the Core refused bytes on this page, floating over the bottom of the bytes rather than
    //taking a row of its own, so moving to or from such a page never changes the panel's size.
    //It takes no pointer: the bytes under it stay selectable, and while the pointer is over a
    //page that still has readable bytes it fades so the row it covers can be read
    .memory-unreadable {
        position: absolute;
        z-index: 1;
        left: 0.6rem;
        right: 0.6rem;
        bottom: 0.6rem;
        display: flex;
        gap: 0.4rem;
        align-items: flex-start;
        width: fit-content;
        margin: 0 auto;
        padding: 0.45rem 0.6rem;
        border: 1px solid color-mix(in srgb, var(--red) 45%, transparent);
        border-radius: 0.4rem;
        background: color-mix(in srgb, var(--tertiary) 65%, transparent);
        backdrop-filter: blur(6px);
        box-shadow: 0 0.25rem 0.8rem rgb(0 0 0 / 0.25);
        font-family: sans-serif;
        font-size: 0.85rem;
        color: var(--tertiary-text);
        overflow-wrap: anywhere;
        pointer-events: none;
        transition: opacity 0.15s;

        :global(svg) {
            color: var(--red);
            flex-shrink: 0;
            margin-top: 0.1rem;
        }
    }

    .memory-grid:has(.memory-numbers:hover) .partial {
        opacity: 0.12;
    }

    //a byte the Core could not read, the size of a hex byte so the grid does not move
    .unreadable-byte {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0.3rem var(--cell-pad-x);
        min-width: calc(var(--cell-pad-x) * 2 + 2ch);
        height: calc(2ch + 0.65rem);
        color: var(--hint);
        cursor: default;
    }

    .memory-numbers {
        grid-area: c;
        color: var(--text-layered);
        display: grid;
        background-color: var(--secondary);
        color: var(--secondary-text);
        border-radius: 0.3rem;
        grid-template-columns: repeat(var(--bytesPerRow), 1fr);
        grid-template-rows: repeat(var(--bytesPerRow), 1fr);
        //a page with more rows than bytes in a row, a Playground's, shares a taller panel evenly
        //between all of them, as the addresses beside them do, and not only between the first
        grid-auto-rows: 1fr;
    }

    .memory-offsets {
        gap: 0.2rem;
        display: flex;
        grid-area: a;
        height: 2rem;
        align-items: center;
        justify-content: space-around;
    }

    .memory-addresses {
        display: flex;
        flex-direction: column;
        grid-area: b;
    }

    .memory-grid-address {
        font-family: monospace;
        padding: 0 0.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 1;
    }
</style>
