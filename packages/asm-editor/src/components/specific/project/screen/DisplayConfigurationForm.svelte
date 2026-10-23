<script lang="ts">
    import { tick } from 'svelte'
    import Select from '#cmp/shared/input/Select.svelte'
    /**
     * MARS's and RARS's five bitmap display parameters, with their choice lists: the form of the
     * Screen header's Display popover and of the Workbench's Display section. `disabled` makes it a
     * read-only summary, which is what it is during a Debug session.
     *
     * A size menu ends in Custom, which opens a field for any size the display takes; the field
     * stays open while the size is one MARS's list lacks, such as the 224 of a `@screen` comment.
     */
    import {
        DISPLAY_SIZE_MAX,
        DISPLAY_SIZE_MIN,
        clampSize,
        formatMarsBaseAddress,
        MARS_BASE_ADDRESS_CHOICES,
        MARS_DISPLAY_SIZE_CHOICES,
        MARS_UNIT_SIZE_CHOICES,
        marsDisplayGeometry,
        type MarsDisplayOrigin,
        normalizeMarsDisplay,
        type ProjectDisplay,
        UNIT_SIZE_MAX,
        UNIT_SIZE_MIN
    } from '#lib/languages/mars/marsDisplay.ts'

    interface Props {
        display: ProjectDisplay
        onChange: (display: ProjectDisplay) => void
        origin?: MarsDisplayOrigin
        /** The label the directive's `base=` named, when it named one rather than an address. */
        baseLabel?: string
        disabled?: boolean
        /** Show the "Bitmap display" heading, which a section with its own title leaves out. */
        heading?: boolean
        /** In the Settings panel: rows with its other Settings' text and padding, not a popover's. */
        panel?: boolean
    }

    let {
        display,
        onChange,
        origin = 'user',
        baseLabel,
        disabled = false,
        heading = true,
        panel = false
    }: Props = $props()

    const fromDirective = $derived(origin === 'directive')
    const current = $derived(normalizeMarsDisplay(display))
    const geometry = $derived(marsDisplayGeometry(current))
    const baseChoices = $derived(listBaseChoices(current.baseAddress, baseLabel))
    const unitSizes = {
        choices: MARS_UNIT_SIZE_CHOICES as readonly number[],
        min: UNIT_SIZE_MIN,
        max: UNIT_SIZE_MAX
    }
    const displaySizes = {
        choices: MARS_DISPLAY_SIZE_CHOICES as readonly number[],
        min: DISPLAY_SIZE_MIN,
        max: DISPLAY_SIZE_MAX
    }
    const dimensions = [
        { field: 'unitWidth', title: 'Unit width in pixels', sizes: unitSizes },
        { field: 'unitHeight', title: 'Unit height in pixels', sizes: unitSizes },
        { field: 'width', title: 'Display width in pixels', sizes: displaySizes },
        { field: 'height', title: 'Display height in pixels', sizes: displaySizes }
    ] as const
    type SizeField = (typeof dimensions)[number]['field']
    /** The menu entry that opens the field: no size, so it never stands for one. */
    const CUSTOM = -1
    /** The sizes whose Custom entry was picked, which keep their field open on a listed size too. */
    let customPicked = $state<Partial<Record<SizeField, boolean>>>({})
    const fields: Partial<Record<SizeField, HTMLInputElement>> = {}
    const selectStyle =
        'padding: 0.4rem 0.6rem; background: var(--tertiary); color: var(--tertiary-text)'

    /**
     * A `base=<label>` resolves to wherever the assembler put that label, which is never one of the
     * five MARS offers, so the menu grows an entry for it rather than dropping the value.
     */
    function listBaseChoices(baseAddress: number, label: string | undefined) {
        const listed = MARS_BASE_ADDRESS_CHOICES.map((choice) => ({
            address: choice.address,
            text: formatMarsBaseAddress(choice.address)
        }))
        if (listed.some((choice) => choice.address >>> 0 === baseAddress >>> 0)) return listed
        const origin = label ? `label ${label}` : 'from the program'
        const hex = `0x${(baseAddress >>> 0).toString(16).padStart(8, '0')}`
        return [{ address: baseAddress, text: `${hex} (${origin})` }, ...listed]
    }

    function change(field: keyof ProjectDisplay, value: number) {
        onChange({ ...current, [field]: value })
    }

    function isCustom(field: SizeField, choices: readonly number[]): boolean {
        return !!customPicked[field] || !choices.includes(current[field])
    }

    async function pick(field: SizeField, value: number) {
        customPicked[field] = value === CUSTOM
        if (value !== CUSTOM) return change(field, value)
        await tick()
        fields[field]?.select()
    }

    /**
     * A typed size, brought into the range; one that is not a number puts the field back. The field
     * stays open whatever was typed, a size on MARS's list included, as it would after picking
     * Custom: it should not vanish under the cursor.
     */
    function commit(
        field: SizeField,
        input: HTMLInputElement,
        sizes: { min: number; max: number }
    ) {
        customPicked[field] = true
        const typed = input.value.trim() === '' ? Number.NaN : Number(input.value)
        const size = clampSize(typed, sizes.min, sizes.max, current[field])
        input.value = String(size)
        if (size !== current[field]) change(field, size)
    }
</script>

<div class="display-form" class:panel>
    {#if heading}
        <h3>Bitmap display</h3>
    {/if}
    {#if fromDirective}
        <p class="hint source-note">
            Set by this program's <code>@screen</code> comment. A change made here rewrites the comment
            in the code and is applied in the next build.
        </p>
    {/if}
    {#each dimensions as dimension (dimension.field)}
        {@const custom = isCustom(dimension.field, dimension.sizes.choices)}
        <div class="display-setting">
            <span>{dimension.title}</span>
            <Select
                {disabled}
                options={[
                    ...dimension.sizes.choices.map((choice) => ({ key: choice, value: choice })),
                    { key: 'Custom…', searchText: 'custom', value: CUSTOM }
                ]}
                value={custom ? CUSTOM : current[dimension.field]}
                ariaLabel={dimension.title}
                style={selectStyle}
                wrapperStyle="min-width: 5rem; max-width: 10rem"
                onChange={(value) => pick(dimension.field, value)}
            />
        </div>
        {#if custom}
            <label class="display-setting custom-size">
                <span>Any size from {dimension.sizes.min} to {dimension.sizes.max}</span>
                <input
                    bind:this={fields[dimension.field]}
                    type="number"
                    min={dimension.sizes.min}
                    max={dimension.sizes.max}
                    step="1"
                    {disabled}
                    value={current[dimension.field]}
                    aria-label="{dimension.title}, custom"
                    onchange={(event) =>
                        commit(dimension.field, event.currentTarget, dimension.sizes)}
                />
            </label>
        {/if}
    {/each}
    <div class="display-setting">
        <span>Base address for display</span>
        <Select
            {disabled}
            options={baseChoices.map((choice) => ({ key: choice.text, value: choice.address }))}
            value={current.baseAddress}
            ariaLabel="Base address for display"
            style={selectStyle}
            wrapperStyle="min-width: 5rem; max-width: 10rem"
            onChange={(value) => change('baseAddress', value)}
        />
    </div>
    <p class="hint">
        {geometry.columns} × {geometry.rows} words from {formatMarsBaseAddress(
            geometry.baseAddress
        )}, one word per pixel, its low 24 bits the color.
    </p>
</div>

<style lang="scss">
    .display-form {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
    }
    .source-note {
        code {
            font-family: 'Fira Code', monospace;
            color: var(--accent);
        }
    }

    h3 {
        font-size: 0.95rem;
        font-weight: bold;
    }

    .display-setting {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        font-size: 0.8rem;
    }

    .custom-size {
        span {
            color: var(--hint);
        }

        input {
            width: 6rem;
            padding: 0.4rem 0.6rem;
            border-radius: 0.4rem;
            background: var(--tertiary);
            color: var(--tertiary-text);
            font-size: 0.8rem;
        }
    }

    .hint {
        font-size: 0.75rem;
        color: var(--hint);
        line-height: 1.4;
    }

    /* the Settings panel's rows: the text and the padding of its other Settings */
    .panel {
        gap: 0.2rem;

        .display-setting {
            padding: 0.2rem 0.4rem;
            font-size: 0.9rem;
        }

        .hint {
            padding: 0 0.4rem;
        }
    }
</style>
