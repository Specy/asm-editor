<script lang="ts">
    import Button from '$cmp/shared/button/Button.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import ValueDiff from '$cmp/specific/project/user-tools/ValueDiffer.svelte'
    import MdTextFields from 'svelte-icons/md/MdTextFields.svelte'
    import FaTimes from 'svelte-icons/fa/FaTimes.svelte'
    import { onMount } from 'svelte'
    import {
        findElInTree,
        getNumberInRange,
        goesNextLineBy,
        inRange
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
        systemSize
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
                    ? ''
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
        {#each new Array(bytesPerRow).fill(0) as _, offset}
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
        {#each memory.current as word, i}
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
                        <div style="user-select: all;">
                            {selectionValue.current}
                        </div>
                        <div style="color: var(--accent); user-select: all">
                            {selectionValue.prev}
                        </div>
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
                    hoverElementStyle={`width: 100%; min-width: fit-content; left: 50%; transform: translateX(-50%);`}
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
