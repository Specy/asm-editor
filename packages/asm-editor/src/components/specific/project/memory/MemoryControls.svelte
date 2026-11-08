<script lang="ts">
    import Select from '#cmp/shared/input/Select.svelte'
    import Switch from '#cmp/shared/input/Switch.svelte'
    import {
        memoryHover,
        memoryRegionColor,
        regionLabels,
        resolveMemoryAddress
    } from '#lib/languages/memoryRegions.ts'
    import type { Emulator } from '#lib/languages/Emulator.ts'
    import type { MemoryRegion, DataLabel } from '#lib/languages/commonLanguageFeatures.svelte.ts'
    import IconButton from '#cmp/shared/button/IconButton.svelte'
    import TextField from '#cmp/shared/input/TextField.svelte'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import FaSearch from '~icons/fa-solid/search'
    import FaAngleLeft from '~icons/fa-solid/angle-left'
    import FaAngleRight from '~icons/fa-solid/angle-right'
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import { SvelteMap } from 'svelte/reactivity'
    import Form from '#cmp/shared/layout/Form.svelte'
    import { clampBigInt } from '#lib/utils.ts'
    import { type RegisterSize, toHexString } from '#lib/languages/commonLanguageFeatures.svelte.ts'

    interface Props {
        emulator?: Emulator
        currentAddress: bigint
        bytesPerPage: number
        memorySize: bigint
        /**
         * Whether the field leaves out its "Address" caption: callers do above a memory view
         * narrower than 16 bytes a row, which leaves the controls too little room for it.
         */
        hideLabel?: boolean
        inputStyle?: string
        style?: string
        systemSize: RegisterSize
        onAddressChange: (address: bigint) => void
        /** Whether the memory region picker sits after the page buttons. */
        showRegions?: boolean
    }

    let {
        emulator,
        currentAddress,
        bytesPerPage,
        memorySize,
        hideLabel = false,
        inputStyle = '',
        style = '',
        systemSize,
        onAddressChange,
        showRegions = true
    }: Props = $props()

    let hexAddress = $derived(currentAddress.toString(16))
    /** Whether the text is hex digits, which the `0x` before it reads with; a label is not. */
    const numericAddress = $derived(/^[0-9a-f]*$/i.test(hexAddress.trim()))
    let inputRef = $state<HTMLInputElement | undefined>()
    let addressFocused = $state(false)
    let caretAtEnd = $state(false)
    let inputScroll = $state(0)

    let error = $state('')
    let filter = $state('')
    let showLibrary = $state(false)
    let chosen = $state<bigint | undefined>()
    /**
     * The picker's groups someone folded or unfolded, by row key, whether folded; every other group
     * keeps its default. Kept for as long as the controls live, so a group stays as it was left when
     * the picker opens again and across Builds, whose region ids do not change.
     */
    const foldChoices = new SvelteMap<string, boolean>()
    /**
     * Whether a group's rows are hidden. Only the 68000's exception vectors start folded: a label
     * for each of their 65 entries pushed everything listed after them out of sight.
     */
    function folded(key: string, byDefault = false) {
        return foldChoices.get(key) ?? byDefault
    }
    const regions = $derived(emulator?.memoryRegions ?? [])
    const labels = $derived(emulator?.dataLabels ?? [])
    /** The labels the field completes and the picker lists: the library's only when asked for. */
    const shownLabels = $derived(
        showLibrary ? labels : labels.filter((label) => !label.fromLibrary)
    )
    function addressInView(address: bigint) {
        return address >= currentAddress && address < currentAddress + BigInt(bytesPerPage)
    }
    /**
     * The address the field names, by number or by label: what a search goes to. It throws for a
     * text that names none, and for an address outside memory.
     */
    function typedAddress(): bigint {
        const address = resolveMemoryAddress(hexAddress || '0', !!emulator?.buildSources, (name) =>
            emulator?.resolveMemoryLabel(name)
        )
        if (address < 0n || address > memorySize) throw new Error('Address is outside memory')
        return address
    }
    const searchChangesView = $derived.by(() => {
        try {
            return !addressInView(typedAddress())
        } catch {
            return false
        }
    })
    const sourceLabelNames = $derived.by(() => {
        const files = [
            ...Object.values(emulator?.buildSources?.files ?? {}),
            ...(showLibrary ? Object.values(emulator?.buildLibraryFiles ?? {}) : [])
        ]
        // Include code labels from the built sources. Resolution below rejects other tokens.
        return files
            .filter((file) => file.encoding === 'plain')
            .flatMap((file) =>
                Array.from(
                    file.content.matchAll(/^[\t ]*([A-Za-z_.$?@][\w.$?@]*)(?=[:\t ]|$)/gm),
                    (match) => match[1]
                )
            )
    })
    const completionNames = $derived(
        [
            ...new Set([
                ...shownLabels.flatMap((label) =>
                    label.displayName ? [label.displayName, label.name] : [label.name]
                ),
                ...sourceLabelNames
            ])
        ].sort((a, b) => a.localeCompare(b))
    )
    const completion = $derived.by(() => {
        const builtEmulator = emulator
        if (!builtEmulator?.buildSources || !addressFocused || !caretAtEnd || !hexAddress) return ''
        const match = completionNames.find(
            (name) =>
                name.startsWith(hexAddress) && builtEmulator.resolveMemoryLabel(name) !== undefined
        )
        return match && match !== hexAddress ? match : ''
    })

    function updateAddressInputState() {
        if (!inputRef) return
        caretAtEnd =
            inputRef.selectionStart === inputRef.selectionEnd &&
            inputRef.selectionEnd === inputRef.value.length
        inputScroll = inputRef.scrollLeft
    }

    function onAddressKeyDown(event: KeyboardEvent) {
        if (event.key !== 'Tab' || event.shiftKey || event.isComposing || !completion) return
        event.preventDefault()
        const value = completion
        hexAddress = value
        error = ''
        const input = event.currentTarget as HTMLInputElement
        input.value = value
        input.setSelectionRange(value.length, value.length)
        updateAddressInputState()
    }
    type Destination = {
        key: string
        searchText?: string
        value: bigint | undefined
        disabled?: boolean
        region?: MemoryRegion
        label?: DataLabel
        /** Whether the group this row heads is open: a section of several runs, or a region's labels. */
        expanded?: boolean
    }
    const destinations = $derived.by(() => {
        const rows: Destination[] = []
        const matches = (text: string) => text.toLowerCase().includes(filter.toLowerCase())
        //a filter lists every match, folded or not, so it finds what a folded group hides
        const filtering = filter !== ''
        const open = (key: string, byDefault = false) => filtering || !folded(key, byDefault)
        const names = [
            ...new Set(
                regions
                    .filter((region) => region.kind !== 'device')
                    .map((region) => region.section ?? region.name)
            )
        ]
        for (const name of names) {
            const group = regions.filter(
                (region) => region.kind !== 'device' && (region.section ?? region.name) === name
            )
            const children: Destination[] = []
            for (const region of group) {
                const members = regionLabels(region, shownLabels)
                const regionMatch = matches(`${name} ${region.kind}`)
                const matchingLabels = members.filter(
                    (label) =>
                        regionMatch ||
                        matches(`${label.name} ${label.displayName ?? ''} ${label.preview ?? ''}`)
                )
                if (regionMatch || matchingLabels.length) {
                    const key = `${region.id}:region`
                    const labelsOpen = open(key, region.kind === 'vectors')
                    children.push({
                        key,
                        searchText: `${region.name} ${region.kind}`,
                        value: region.destination ?? region.start,
                        region,
                        expanded: filtering || !members.length ? undefined : labelsOpen
                    })
                    if (labelsOpen)
                        for (const label of matchingLabels)
                            children.push({
                                key: `${region.id}:${label.name}:${label.address}`,
                                searchText: label.displayName ?? label.name,
                                value: label.address,
                                region,
                                label
                            })
                }
            }
            if (children.length) {
                const sectionOpen = group.length === 1 || open(name)
                if (group.length > 1)
                    rows.push({
                        key: name,
                        value: undefined,
                        disabled: true,
                        expanded: filtering ? undefined : sectionOpen
                    })
                if (sectionOpen) rows.push(...children)
            }
        }
        const devices = regions.filter((region) => region.kind === 'device' && matches(region.name))
        if (devices.length) {
            const devicesOpen = open('Devices')
            rows.push({
                key: 'Devices',
                value: undefined,
                disabled: true,
                expanded: filtering ? undefined : devicesOpen
            })
            if (devicesOpen)
                rows.push(
                    ...devices.map((region) => ({
                        key: region.id,
                        searchText: region.name,
                        value: region.start,
                        region
                    }))
                )
        }
        if (!rows.length)
            rows.push({ key: 'No matching regions', value: undefined, disabled: true })
        return rows
    })
    /** Whether any row folds, which gives every region row a chevron's room so their swatches line up. */
    const foldable = $derived(destinations.some((row) => row.expanded !== undefined))
    const currentRegion = $derived(
        memoryHover(regions, labels, currentAddress) ||
            regions.find((region) => region.start === currentAddress && region.end === region.start)
                ?.name ||
            ''
    )
    function searchAddress() {
        try {
            const newAddress = typedAddress()
            error = ''
            hexAddress = toHexString(newAddress, systemSize)
            if (!addressInView(newAddress)) updateAddress(newAddress)
        } catch (cause) {
            error = cause instanceof Error ? cause.message : 'Invalid address'
        }
    }
    function destinationTitle(row: Destination) {
        if (!row.region) return row.key
        if (row.label)
            return `${row.label.displayName ?? row.label.name}${row.label.preview ? ` "${row.label.preview}"` : ''}${row.label.fromLibrary ? ' (library)' : ''}`
        const group = regions.filter((region) => region.section === row.region?.section)
        const first = regionLabels(row.region, shownLabels)[0]
        return `${row.region.section && group.length > 1 ? row.region.kind : row.region.name}${first ? ` · ${first.displayName ?? first.name}` : ''}`
    }

    /**
     * A label row's tooltip where it shows a name in place of the raw one, such as an Executable's
     * demangled C++ name: both, so the raw name stays readable.
     */
    function labelTooltip(label: DataLabel): string | undefined {
        const display = label.displayName ?? label.name
        return display === label.name ? undefined : `${display}\n${label.name}`
    }

    function updateAddress(value: bigint) {
        const clampedSize = value - (value % BigInt(bytesPerPage))
        const minMaxAddress = clampBigInt(clampedSize, 0n, memorySize - BigInt(bytesPerPage - 1))
        onAddressChange(minMaxAddress)
    }
</script>

<div class="memory-controls-layout">
    <Form style="width:100%; {style}" onSubmit={searchAddress}>
        <div class="address-search" class:without-regions={!showRegions}>
            <!-- a click anywhere on the field puts the caret in its input, which the keyboard
                 reaches by Tab -->
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div
                class="hex-address"
                style={inputStyle}
                onclick={() => {
                    inputRef?.focus()
                }}
            >
                {#if !hideLabel}
                    <span class="address-caption"> Address </span>
                {/if}
                {#if numericAddress}
                    <span class="hex-address-label"> 0x </span>
                {/if}
                <div class="hex-address-entry">
                    {#if completion}
                        <div class="address-completion" aria-hidden="true">
                            <span style:transform={`translateX(-${inputScroll}px)`}
                                ><span class="completion-prefix">{hexAddress}</span><span
                                    class="completion-suffix"
                                    >{completion.slice(hexAddress.length)}</span
                                ></span
                            >
                        </div>
                    {/if}
                    <input
                        bind:this={inputRef}
                        spellcheck="false"
                        autocomplete="off"
                        bind:value={hexAddress}
                        class="hex-address-input"
                        aria-label="Address or label"
                        aria-autocomplete="inline"
                        aria-invalid={!!error}
                        title={error || 'Hex address or label+offset (Tab completes labels)'}
                        oninput={() => {
                            error = ''
                            updateAddressInputState()
                        }}
                        onfocus={() => {
                            addressFocused = true
                            updateAddressInputState()
                        }}
                        onblur={() => (addressFocused = false)}
                        onselect={updateAddressInputState}
                        onscroll={updateAddressInputState}
                        onkeyup={updateAddressInputState}
                        onkeydown={onAddressKeyDown}
                    />
                </div>
                <IconButton
                    label="Search address"
                    emphasis={searchChangesView}
                    style="flex-shrink: 0"
                    onClick={searchAddress}
                    {@attach tooltip('Search address')}
                >
                    <Icon size={1}>
                        <FaSearch />
                    </Icon>
                </IconButton>
            </div>

            <IconButton
                label="Previous page"
                onClick={() => updateAddress(currentAddress - BigInt(bytesPerPage))}
                {@attach tooltip('Previous page')}
            >
                <Icon size={1.2}>
                    <FaAngleLeft />
                </Icon>
            </IconButton>

            <IconButton
                label="Next page"
                onClick={() => updateAddress(currentAddress + BigInt(bytesPerPage))}
                {@attach tooltip('Next page')}
            >
                <Icon size={1.2}>
                    <FaAngleRight />
                </Icon>
            </IconButton>

            {#if showRegions}
                <!-- the title completes the region's name, which the trigger cuts short; the
                     Tooltip says why the picker is disabled -->
                <div
                    class="region-picker"
                    title={emulator?.buildSources ? currentRegion || 'Memory regions' : undefined}
                >
                    <Select
                        options={destinations}
                        bind:value={chosen}
                        disabled={!emulator?.buildSources}
                        {@attach tooltip(
                            emulator?.buildSources ? undefined : 'Build to see memory regions'
                        )}
                        ariaLabel="Memory regions"
                        popupWidth={400}
                        onToggle={(row) => foldChoices.set(String(row.key), !!row.expanded)}
                        wrapperStyle="height: 100%;"
                        compact
                        style="height: 100%; gap: 0.4rem; font-size: 0.8rem; border: 1px solid var(--memory-control-border);"
                        onChange={(address) => {
                            if (address !== undefined) {
                                error = ''
                                updateAddress(address)
                            }
                        }}
                    >
                        {#snippet trigger()}<span class="picker-current-region ellipsis"
                                >{currentRegion || 'Memory regions'}</span
                            >{/snippet}
                        {#snippet popupHeader({ focusOptions, close })}
                            <div class="picker-header">
                                <TextField
                                    aria-label="Filter memory regions"
                                    placeholder="Filter regions and labels"
                                    autocomplete="off"
                                    bind:value={filter}
                                    onkeydown={(event) => {
                                        if (event.key === 'ArrowDown') {
                                            event.preventDefault()
                                            focusOptions()
                                        } else if (event.key === 'Escape') {
                                            close()
                                        }
                                    }}
                                />
                                <div class="library-toggle">
                                    <span>Show library labels</span>
                                    <Switch
                                        bind:checked={showLibrary}
                                        title="Show library labels"
                                    />
                                </div>
                            </div>
                        {/snippet}
                        {#snippet item(row, { toggle })}
                            {@const destination = row as Destination}
                            <div
                                class="destination"
                                class:data-label={!!destination.label}
                                class:foldable
                                title={destination.label && labelTooltip(destination.label)}
                            >
                                <!-- the arrow keys fold a group, so the chevron is for the
                                     pointer; a click on the rest of a region's row goes there -->
                                {#if destination.expanded !== undefined}
                                    <span
                                        class="disclosure"
                                        class:expanded={destination.expanded}
                                        aria-hidden="true"
                                        onclick={(event) => {
                                            event.stopPropagation()
                                            toggle()
                                        }}><FaAngleRight /></span
                                    >
                                {:else if foldable && !destination.label}
                                    <span class="disclosure-spacer"></span>
                                {/if}
                                {#if destination.region && !destination.label}<span
                                        class="swatch"
                                        style:background={memoryRegionColor(
                                            destination.region.kind
                                        )}
                                    ></span>{/if}
                                <span>{destinationTitle(destination)}</span>
                                {#if destination.value !== undefined}<small
                                        >0x{destination.value.toString(
                                            16
                                        )}{#if !destination.label && destination.region}{` · ${destination.region.end - destination.region.start} B`}{/if}</small
                                    >{/if}
                            </div>
                        {/snippet}
                    </Select>
                </div>
            {/if}
        </div>
        {#if error}<div class="address-error" role="alert">{error}</div>{/if}
    </Form>
</div>

<style lang="scss">
    @use '../../../../styles/radius.scss' as *;
    @use '../../../../styles/field.scss';

    .memory-controls-layout {
        --memory-control-border: var(--line);
        container: memory-controls / inline-size;
        flex: 1;
        width: 100%;
        min-width: 0;
    }
    .picker-header {
        display: grid;
        gap: 0.5rem;
        padding: 0.5rem;
    }
    /* a field, edged with the list's line, which the Select's Popover redefines as its text at
       15% so that it shows on the list's own --tertiary */
    .picker-header > :global(.text-field) {
        width: 100%;
    }
    .library-toggle {
        font-size: var(--fs-small);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.8rem;
    }
    .destination {
        position: relative;
        display: flex;
        align-items: center;
        gap: 0.4rem;
        flex-wrap: wrap;
    }
    .destination small {
        margin-left: auto;
        color: var(--text-muted);
        font-family: var(--font-mono);
    }
    .data-label {
        padding-left: 1.3rem;
    }
    /* the name under its region's, past the chevron's room */
    .data-label.foldable {
        padding-left: 2.7rem;
    }
    .disclosure,
    .disclosure-spacer {
        display: grid;
        flex: 0 0 1rem;
        place-items: center;
        width: 1rem;
        height: 1rem;
    }
    .disclosure {
        /* how far the click area reaches past the chevron's 1rem slot: left over the Select
           option's 0.75rem padding to the row's edge, right to just before what follows */
        --reach-left: 0.75rem;
        --reach-right: 0.2rem;
        font-size: 0.7rem;
        cursor: pointer;
        /* what takes the click: that reach, over the row's whole height and its 0.5rem padding.
           Placed against the row, so it covers a row whose address wrapped too */
        &::before {
            content: '';
            position: absolute;
            top: -0.5rem;
            bottom: -0.5rem;
            left: calc(-1 * var(--reach-left));
            width: calc(var(--reach-left) + 1rem + var(--reach-right));
            /* the corners of the option it starts at the edge of, in the Select's list */
            border-radius: nested-radius(var(--r-overlay), $border: 1px, $inset: 0.25rem);
        }
        &:hover::before {
            background: color-mix(in srgb, currentColor 18%, transparent);
        }
        /* the icon turns, not the span, whose turning would carry the click area round with it.
           Moved to the middle of that area, and positioned so it is drawn over its hover colour */
        & > :global(svg) {
            position: relative;
            left: calc((var(--reach-right) - var(--reach-left)) / 2);
            transition: transform var(--dur-fast) ease;
        }
        &.expanded > :global(svg) {
            transform: rotate(90deg);
        }
    }
    @media (prefers-reduced-motion: reduce) {
        .disclosure > :global(svg) {
            transition: none;
        }
    }
    .swatch {
        width: 0.9rem;
        height: 0.9rem;
        border: 1px solid var(--line);
        border-radius: 0.2rem;
        flex-shrink: 0;
    }
    .region-picker {
        flex: 0 1 11rem;
        min-width: 0;
        max-width: 45%;
    }
    .picker-current-region {
        display: block;
    }
    .address-error {
        color: var(--danger);
        font-size: var(--fs-small);
    }
    .address-caption {
        margin-right: 0.35rem;
    }
    .hex-address-label {
        padding: 0.3rem 0;
        color: var(--text-muted);
    }
    .address-search {
        display: flex;
        flex: 1;
        width: 100%;
        gap: 0.3rem;
    }

    /* a field (styles/field.scss) round the caption, the 0x and the typed address */
    .hex-address {
        @include field.box('.hex-address-input');
        flex: 1;
        min-width: 0;
        display: flex;
        /* the text has as much room on its right as above and below it, the input's own 0.3rem
           included */
        padding: 0.2rem 0.2rem 0.2rem 0.6rem;
        align-items: center;
        font-size: var(--fs-small);
    }
    .hex-address-entry {
        position: relative;
        min-width: 0;
        flex: 1;
    }
    .hex-address-input,
    .address-completion {
        padding: 0.3rem 0.3rem 0.3rem 0;
        font-size: var(--fs-body);
        font-family: var(--font-mono);
    }
    .address-completion {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        overflow: hidden;
        white-space: pre;
        pointer-events: none;
        color: inherit;
    }
    .address-completion > span {
        flex-shrink: 0;
    }
    .completion-prefix {
        visibility: hidden;
    }
    .completion-suffix {
        color: var(--hint);
    }
    .hex-address-input {
        position: relative;
        width: 100%;
        display: flex;
        flex: 1;
    }
    @container memory-controls (max-width: 22rem) {
        .address-search:not(.without-regions) {
            display: grid;
            grid-template-columns: minmax(0, 1fr) repeat(2, 1.8rem);
            gap: 0.3rem;
        }
        .address-search:not(.without-regions) .hex-address {
            grid-column: 1;
            grid-row: 1;
            min-width: 100%;
        }
        .region-picker {
            grid-column: 1 / -1;
            grid-row: 2;
            max-width: none;
            margin: 0;
        }
    }
    @container memory-controls (max-width: 14rem) {
        .address-search:not(.without-regions) {
            grid-template-columns: repeat(2, 1.8rem) minmax(0, 1fr);
        }
        .address-search:not(.without-regions) .hex-address {
            grid-column: 1 / -1;
        }
        .address-caption {
            display: none;
        }
        .region-picker {
            grid-column: 3;
        }
    }
</style>
