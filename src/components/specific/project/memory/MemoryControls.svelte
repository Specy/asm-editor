<script lang="ts">
    import Select from '$cmp/shared/input/Select.svelte'
    import Switch from '$cmp/shared/input/Switch.svelte'
    import {
        memoryHover,
        memoryRegionColor,
        regionLabels,
        resolveMemoryAddress
    } from '$lib/languages/memoryRegions'
    import type { Emulator } from '$lib/languages/Emulator'
    import type { MemoryRegion, DataLabel } from '$lib/languages/commonLanguageFeatures.svelte'
    import type { ThemeKeys } from '$stores/themeStore.svelte'
    import Button from '$cmp/shared/button/Button.svelte'
    import FaSearch from '~icons/fa-solid/search'
    import FaAngleLeft from '~icons/fa-solid/angle-left'
    import FaAngleRight from '~icons/fa-solid/angle-right'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import Form from '$cmp/shared/layout/Form.svelte'
    import { clampBigInt } from '$lib/utils'
    import { type RegisterSize, toHexString } from '$lib/languages/commonLanguageFeatures.svelte'

    interface Props {
        emulator?: Emulator
        currentAddress: bigint
        bytesPerPage: number
        memorySize: bigint
        hideLabel?: boolean
        inputStyle?: string
        style?: string
        systemSize: RegisterSize
        onAddressChange: (address: bigint) => void
        /**
         * The buttons' colour: the page's own by default, where the controls sit on the page; a
         * caller that puts them on a card passes the card's, so they read as part of it.
         */
        buttonVar?: ThemeKeys
    }

    let {
        emulator,
        currentAddress = $bindable(),
        bytesPerPage,
        memorySize,
        hideLabel = false,
        inputStyle = '',
        style = '',
        systemSize,
        onAddressChange,
        buttonVar = 'primary'
    }: Props = $props()

    let hexAddress = $derived(currentAddress.toString(16))
    let inputRef = $state<HTMLInputElement | undefined>()

    let error = $state('')
    let filter = $state('')
    let showLibrary = $state(false)
    let chosen = $state<bigint | undefined>()
    const regions = $derived(emulator?.memoryRegions ?? [])
    const labels = $derived(emulator?.dataLabels ?? [])
    type Destination = {
        key: string
        searchText?: string
        value: bigint | undefined
        disabled?: boolean
        region?: MemoryRegion
        label?: DataLabel
    }
    const destinations = $derived.by(() => {
        const rows: Destination[] = []
        const matches = (text: string) => text.toLowerCase().includes(filter.toLowerCase())
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
                const members = regionLabels(region, labels).filter(
                    (label) => showLibrary || !label.fromLibrary
                )
                const regionMatch = matches(`${name} ${region.kind}`)
                const matchingLabels = members.filter(
                    (label) =>
                        regionMatch ||
                        matches(`${label.name} ${label.displayName ?? ''} ${label.preview ?? ''}`)
                )
                if (regionMatch || matchingLabels.length) {
                    children.push({
                        key: `${region.id}:region`,
                        searchText: `${region.name} ${region.kind}`,
                        value: region.destination ?? region.start,
                        region
                    })
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
                if (group.length > 1) rows.push({ key: name, value: undefined, disabled: true })
                rows.push(...children)
            }
        }
        const devices = regions.filter((region) => region.kind === 'device' && matches(region.name))
        if (devices.length)
            rows.push(
                { key: 'Devices', value: undefined, disabled: true },
                ...devices.map((region) => ({
                    key: region.id,
                    searchText: region.name,
                    value: region.start,
                    region
                }))
            )
        if (!rows.length)
            rows.push({ key: 'No matching regions', value: undefined, disabled: true })
        return rows
    })
    const currentRegion = $derived(memoryHover(regions, labels, currentAddress) ||
        regions.find(region => region.start === currentAddress && region.end === region.start)?.name || '')
    function searchAddress() {
        try {
            const newAddress = resolveMemoryAddress(
                hexAddress || '0',
                !!emulator?.buildSources,
                (name) => emulator?.resolveMemoryLabel(name)
            )
            if (newAddress < 0n || newAddress > memorySize)
                throw new Error('Address is outside memory')
            error = ''
            hexAddress = toHexString(newAddress, systemSize)
            updateAddress(newAddress)
        } catch (cause) {
            error = cause instanceof Error ? cause.message : 'Invalid address'
        }
    }
    function destinationTitle(row: Destination) {
        if (!row.region) return row.key
        if (row.label)
            return `${row.label.displayName ?? row.label.name}${row.label.preview ? ` "${row.label.preview}"` : ''}${row.label.fromLibrary ? ' (library)' : ''}`
        const group = regions.filter((region) => region.section === row.region?.section)
        const first = regionLabels(row.region, labels).find(
            (label) => showLibrary || !label.fromLibrary
        )
        return `${row.region.section && group.length > 1 ? row.region.kind : row.region.name}${first ? ` · ${first.displayName ?? first.name}` : ''}`
    }

    function updateAddress(value: bigint) {
        const clampedSize = value - (value % BigInt(bytesPerPage))
        const minMaxAddress = clampBigInt(clampedSize, 0n, memorySize - BigInt(bytesPerPage - 1))
        onAddressChange(minMaxAddress)
    }
</script>

<div class="memory-controls-layout">
<Form style="width:100%; {style}" on:submit={searchAddress}>
    <div class="address-search">
        <div
            class="hex-address"
            style={inputStyle}
            onclick={() => {
                inputRef?.focus()
            }}
        >
            {#if !hideLabel}
                <span> Address </span>
            {/if}
            <span class="hex-address-label" class:hex-address-label-no-prefix={hideLabel}>
                0x
            </span>
            <input
                bind:this={inputRef}
                spellcheck="false"
                bind:value={hexAddress}
                class="hex-address-input"
                aria-label="Address or label"
                aria-invalid={!!error}
                title={error || 'Hex address or label+offset'}
                oninput={() => (error = '')}
            />
        <Button
            onClick={searchAddress}
            hasIcon
            style="padding: 0; width:1.8rem; min-height: 1.8rem; flex-shrink: 0;"
            cssVar="unset"
            bg="transparent"
            color="var(--secondary-text)"
            title="Search address"
            active={hexAddress !== currentAddress.toString(16)}
        >
            <Icon size={1}>
                <FaSearch />
            </Icon>
        </Button>
        </div>

        <div class="region-picker" title={emulator?.buildSources ? currentRegion || 'Memory regions' : 'Build to see memory regions'}>
            <Select
                options={destinations}
                bind:value={chosen}
                disabled={!emulator?.buildSources}
                ariaLabel="Memory regions"
                popupWidth={360}
                wrapperStyle="height: 100%;"
                style="padding: 0.4rem 0.6rem; height: 100%; gap: 0.4rem; font-size: 0.8rem; border: 1px solid var(--memory-control-border);"
                onChange={(address) => {
                    if (address !== undefined) {
                        error = ''
                        updateAddress(address)
                    }
                }}
            >
                {#snippet trigger()}<span class="picker-current-region">{currentRegion || 'Memory regions'}</span>{/snippet}
                {#snippet popupHeader({ focusOptions, close })}
                    <div class="picker-header">
                        <input
                            aria-label="Filter memory regions"
                            placeholder="Filter regions and labels"
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
                            <Switch bind:checked={showLibrary} title="Show library labels" />
                        </div>
                    </div>
                {/snippet}
                {#snippet item(row)}
                    {@const destination = row as Destination}
                    <div class="destination" class:data-label={!!destination.label}>
                        {#if destination.region && !destination.label}<span
                                class="swatch"
                                style:background={memoryRegionColor(destination.region.kind)}
                            ></span>{/if}
                        <span>{destinationTitle(destination)}</span>
                        {#if destination.value !== undefined}<small
                                >0x{destination.value.toString(
                                    16
                                )}{#if !destination.label && destination.region}
                                    · {destination.region.end - destination.region.start} B{/if}</small
                            >{/if}
                    </div>
                {/snippet}
            </Select>
        </div>

        <Button
            onClick={() => updateAddress(currentAddress - BigInt(bytesPerPage))}
            hasIcon
            style="padding: 0; width:1.8rem; min-height: 1.8rem;"
            cssVar={buttonVar}
            title="Previous page"
        >
            <Icon size={1.2}>
                <FaAngleLeft />
            </Icon>
        </Button>

        <Button
            onClick={() => updateAddress(currentAddress + BigInt(bytesPerPage))}
            hasIcon
            style="padding: 0; width:1.8rem; min-height: 1.8rem;"
            cssVar={buttonVar}
            title="Next page"
        >
            <Icon size={1.2}>
                <FaAngleRight />
            </Icon>
        </Button>
    </div>
    {#if error}<div class="address-error" role="alert">{error}</div>{/if}
</Form>
</div>

<style lang="scss">
    .memory-controls-layout {
        --memory-control-border: var(--wb-line, color-mix(in srgb, var(--tertiary) 60%, transparent));
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
    .picker-header > input {
        width: 100%;
        padding: 0.5rem;
        background: var(--primary);
        color: var(--primary-text);
        border: 1px solid var(--tertiary);
        border-radius: 0.3rem;
    }
    .library-toggle {
        font-size: 0.8rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.8rem;
    }
    .destination {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        flex-wrap: wrap;
    }
    .destination small {
        margin-left: auto;
        opacity: 0.7;
        font-family: monospace;
    }
    .data-label {
        padding-left: 1.3rem;
    }
    .swatch {
        width: 0.9rem;
        height: 0.9rem;
        border: 1px solid var(--tertiary);
        border-radius: 0.2rem;
        flex-shrink: 0;
    }
    .region-picker {
        flex: 0 1 11rem;
        min-width: 0;
        max-width: 45%;
        margin: 0 0.3rem;
    }
    .picker-current-region {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .address-error {
        color: var(--red);
        font-size: 0.8rem;
    }
    .hex-address-label {
        margin-left: 0.35rem;
        padding: 0.3rem 0;
        opacity: 0.6;
    }
    .hex-address-label-no-prefix {
        margin-left: 0;
        padding: 0.3rem 0;
    }
    .address-search {
        display: flex;
        flex: 1;
        width: 100%;
    }

    .hex-address {
        flex: 1;
        min-width: 0;
        display: flex;
        border: 1px solid var(--memory-control-border);
        border-radius: 0.4rem;
        /* the text has as much room on its right as above and below it, the input's own 0.3rem
           included */
        padding: 0.2rem 0.2rem 0.2rem 0.6rem;
        align-items: center;
        font-size: 0.9rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
    }
    .hex-address-input {
        width: 100%;
        min-width: 0;
        padding: 0.3rem 0.3rem 0.3rem 0;
        font-size: 1rem;
        font-family: monospace;
        color: var(--secondary-text);
        display: flex;
        flex: 1;
        border: none;
        background-color: transparent;
    }
    @container memory-controls (max-width: 22rem) {
        .address-search {
            display: grid;
            grid-template-columns: minmax(0, 1fr) repeat(2, 1.8rem);
            gap: 0.3rem;
        }
        .hex-address {
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
</style>
