<script lang="ts">
    import Select from '$cmp/shared/input/Select.svelte'
    /**
     * MARS's and RARS's five bitmap display parameters, with their choice lists: the form of the
     * Screen header's Display popover and of the Workbench's Display section. `disabled` makes it a
     * read-only summary, which is what it is during a Debug session.
     */
    import {
        formatMarsBaseAddress,
        MARS_BASE_ADDRESS_CHOICES,
        MARS_DISPLAY_SIZE_CHOICES,
        MARS_UNIT_SIZE_CHOICES,
        marsDisplayGeometry,
        type MarsDisplayOrigin,
        normalizeMarsDisplay,
        type ProjectDisplay
    } from '$lib/languages/mars/marsDisplay'

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
    const dimensions = [
        { field: 'unitWidth', title: 'Unit width in pixels', choices: MARS_UNIT_SIZE_CHOICES },
        { field: 'unitHeight', title: 'Unit height in pixels', choices: MARS_UNIT_SIZE_CHOICES },
        { field: 'width', title: 'Display width in pixels', choices: MARS_DISPLAY_SIZE_CHOICES },
        { field: 'height', title: 'Display height in pixels', choices: MARS_DISPLAY_SIZE_CHOICES }
    ] as const
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
</script>

<div class="display-form" class:panel>
    {#if heading}
        <h3>Bitmap display</h3>
    {/if}
    {#if fromDirective}
        <p class="hint source-note">
            Set by this program's <code>@screen</code> comment. A change made here rewrites the comment,
            so the next Build reads it back.
        </p>
    {/if}
    {#each dimensions as dimension (dimension.field)}
        <div class="display-setting">
            <span>{dimension.title}</span>
            <Select
                {disabled}
                options={dimension.choices.map((choice) => ({ key: choice, value: choice }))}
                value={current[dimension.field]}
                ariaLabel={dimension.title}
                style={selectStyle}
                wrapperStyle="min-width: 5rem; max-width: 10rem"
                onChange={(value) => change(dimension.field, value)}
            />
        </div>
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
