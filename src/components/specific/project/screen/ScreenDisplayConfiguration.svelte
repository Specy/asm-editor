<script lang="ts">
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import FaSlidersH from '~icons/fa-solid/sliders-h'
    import {
        formatMarsBaseAddress,
        MARS_BASE_ADDRESS_CHOICES,
        MARS_DISPLAY_SIZE_CHOICES,
        MARS_UNIT_SIZE_CHOICES,
        marsDisplayGeometry,
        normalizeMarsDisplay,
        type ProjectDisplay
    } from '$lib/languages/mars/marsDisplay'

    /**
     * The bitmap display configuration of the MIPS and RISC-V Screen panel: MARS's and RARS's own
     * five parameters, with their choice lists and their defaults. It renders into the panel
     * header's configuration slot.
     *
     * The user configures these, not the program, because the simulators' bitmap display is a tool
     * with a settings window rather than something a program can ask for. Every change is applied at
     * once and the Screen re-syncs from memory, as MARS does; the caller stores the value in the
     * project so it comes back with it, and testcases run with it too.
     */

    interface Props {
        display: ProjectDisplay
        onChange: (display: ProjectDisplay) => void
        /** Disabled while a program owns the emulator, like the other execution-time controls. */
        disabled?: boolean
    }

    let { display, onChange, disabled = false }: Props = $props()

    let open = $state(false)
    let panel: HTMLDivElement | undefined = $state()

    const current = $derived(normalizeMarsDisplay(display))
    const geometry = $derived(marsDisplayGeometry(current))

    function change(field: keyof ProjectDisplay, value: string) {
        onChange({ ...current, [field]: Number(value) })
    }

    function handleWindowPointerDown(event: MouseEvent) {
        if (!open) return
        if (panel && event.target instanceof Node && panel.contains(event.target)) return
        open = false
    }
</script>

<svelte:window
    onmousedown={handleWindowPointerDown}
    onkeydown={(event) => {
        if (event.key === 'Escape') open = false
    }}
/>

<div class="display-configuration" bind:this={panel}>
    <button
        class="display-button"
        title="Bitmap display parameters"
        aria-expanded={open}
        {disabled}
        onclick={() => (open = !open)}
    >
        <Icon size={0.8}>
            <FaSlidersH />
        </Icon>
        Display
    </button>
    {#if open}
        <div class="display-popover">
            <h3>Bitmap display</h3>
            <label>
                <span>Unit width in pixels</span>
                <select
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
                    value={String(current.baseAddress)}
                    onchange={(event) => change('baseAddress', event.currentTarget.value)}
                >
                    {#each MARS_BASE_ADDRESS_CHOICES as choice (choice.address)}
                        <option value={String(choice.address)}>
                            {formatMarsBaseAddress(choice.address)}
                        </option>
                    {/each}
                </select>
            </label>
            <p class="hint">
                {geometry.columns} × {geometry.rows} words from {formatMarsBaseAddress(
                    geometry.baseAddress
                )}, one word per pixel, its low 24 bits the color.
            </p>
        </div>
    {/if}
</div>

<style lang="scss">
    .display-configuration {
        position: relative;
        display: flex;
    }

    .display-button {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.15rem 0.4rem;
        border-radius: 0.3rem;
        cursor: pointer;
        font-size: 0.8rem;
        background-color: var(--secondary);
        color: var(--secondary-text);

        &:disabled {
            opacity: 0.5;
            cursor: default;
        }
    }

    .display-popover {
        position: absolute;
        top: calc(100% + 0.3rem);
        right: 0;
        z-index: 10;
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        width: 18rem;
        max-width: calc(100vw - 2rem);
        padding: 0.7rem;
        border-radius: 0.4rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
        box-shadow: 0 0.4rem 1rem rgba(0, 0, 0, 0.35);
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

    .hint {
        font-size: 0.75rem;
        color: var(--hint);
        line-height: 1.4;
    }
</style>
