<script lang="ts">
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

    function change(field: keyof ProjectDisplay, value: string) {
        onChange({ ...current, [field]: Number(value) })
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
    <label>
        <span>Unit width in pixels</span>
        <select
            {disabled}
            value={String(current.unitWidth)}
            onchange={(event) => change('unitWidth', event.currentTarget.value)}
        >
            {#each MARS_UNIT_SIZE_CHOICES as choice (choice)}
                <option value={String(choice)}>{choice}</option>
            {/each}
        </select>
    </label>
    <label>
        <span>Unit height in pixels</span>
        <select
            {disabled}
            value={String(current.unitHeight)}
            onchange={(event) => change('unitHeight', event.currentTarget.value)}
        >
            {#each MARS_UNIT_SIZE_CHOICES as choice (choice)}
                <option value={String(choice)}>{choice}</option>
            {/each}
        </select>
    </label>
    <label>
        <span>Display width in pixels</span>
        <select
            {disabled}
            value={String(current.width)}
            onchange={(event) => change('width', event.currentTarget.value)}
        >
            {#each MARS_DISPLAY_SIZE_CHOICES as choice (choice)}
                <option value={String(choice)}>{choice}</option>
            {/each}
        </select>
    </label>
    <label>
        <span>Display height in pixels</span>
        <select
            {disabled}
            value={String(current.height)}
            onchange={(event) => change('height', event.currentTarget.value)}
        >
            {#each MARS_DISPLAY_SIZE_CHOICES as choice (choice)}
                <option value={String(choice)}>{choice}</option>
            {/each}
        </select>
    </label>
    <label>
        <span>Base address for display</span>
        <select
            {disabled}
            value={String(current.baseAddress)}
            onchange={(event) => change('baseAddress', event.currentTarget.value)}
        >
            {#each baseChoices as choice (choice.address)}
                <option value={String(choice.address)}>{choice.text}</option>
            {/each}
        </select>
    </label>
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
            font-family: FiraCode;
            color: var(--accent);
        }
    }

    h3 {
        font-size: 0.95rem;
        font-weight: bold;
    }

    label {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        font-size: 0.8rem;
    }

    select {
        background-color: var(--tertiary);
        color: var(--tertiary-text);
        border-radius: 0.3rem;
        padding: 0.2rem 0.3rem;
        font-family: monospace;
        font-size: 0.8rem;
        max-width: 10rem;
    }

    select:disabled {
        opacity: 0.6;
        cursor: default;
    }

    .hint {
        font-size: 0.75rem;
        color: var(--hint);
        line-height: 1.4;
    }

    /* the Settings panel's rows: the text and the padding of its other Settings */
    .panel {
        gap: 0.2rem;

        label {
            padding: 0.2rem 0.4rem;
            font-size: 0.9rem;
        }

        .hint {
            padding: 0 0.4rem;
        }
    }
</style>
