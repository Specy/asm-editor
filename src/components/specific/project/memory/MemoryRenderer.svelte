<script lang="ts">
    import Button from '$cmp/shared/button/Button.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import ValueDiff from '$cmp/specific/project/user-tools/ValueDiffer.svelte'
    import MdTextFields from '~icons/ic/baseline-text-fields'
    import FaTimes from '~icons/fa-solid/times'
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
        pokeable = false,
        onPoke
    }: Props = $props()
    const maxAddresses = systemSize
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
        if (pokeAnchor !== null || selectionLength <= 0) return
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

<div class="memory-grid" style={`--bytesPerRow: ${bytesPerRow}; ${style}`}>
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
            style="height:2rem; min-width: 3.8rem; padding-bottom: 0; padding-right: 0.25rem;"
        >
            <Button
                title={type === DisplayType.Hex ? 'Show as character' : 'Show as hex'}
                style="padding: 0.2rem; border-radius: 0.35rem; height:100%; width: 100%"
                onClick={() =>
                    (type = type === DisplayType.Hex ? DisplayType.Char : DisplayType.Hex)}
                active={type === DisplayType.Char}
                cssVar="accent2"
            >
                <Icon size={1}>
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
                    <Icon size={1}>
                        <FaTimes />
                    </Icon>
                </Button>
            {/if}
        </Row>
        {#each visibleAddresses as address (address)}
            <div class="memory-grid-address">
                {getTextFromValue(address, 4, DisplayType.Hex)}
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
								bottom: calc(${i > pageSize - bytesPerRow - 1 ? '1.8rem' : '-2.7rem'} - ${selectionValue.current !== signedSelection ? '1.2rem' : '0.1rem'});
								left: ${overflowsBy.overflows ? `calc(-${overflowsBy.by} * 1.75rem)` : '0'};
								min-width: ${selectionValue.len * 1.7}rem;
						`}
                    >
                        {#if selectionValue.current !== signedSelection}
                            <div style="user-select: all;">
                                {signedSelection}
                            </div>
                        {/if}
                        {#if pokeable && onPoke}
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
                    style={`padding: 0.3rem; min-width: calc(0.6rem + 2ch); height: calc(2ch + 0.65rem);
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
            </div>
        {/each}
    </div>
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

    .memory-number {
        position: relative;
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
        border-radius: 0.5rem;
        padding-right: 0.3rem;
        padding-bottom: 0.3rem;
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
