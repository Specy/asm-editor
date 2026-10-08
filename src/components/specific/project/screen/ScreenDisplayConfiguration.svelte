<script lang="ts">
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import FaSlidersH from '~icons/fa-solid/sliders-h'
    import type { MarsDisplayOrigin, ProjectDisplay } from '$lib/languages/mars/marsDisplay'
    import DisplayConfigurationForm from './DisplayConfigurationForm.svelte'

    /**
     * The bitmap display configuration of the MIPS and RISC-V Screen panel: MARS's and RARS's own
     * five parameters, with their choice lists and their defaults. It renders into the panel
     * header's configuration slot.
     *
     * The user configures these, as in MARS's own settings window, unless the program says what it
     * wants in a `# @screen` comment, which every Build reads. Either way a change is applied at
     * once and the Screen re-syncs from memory, as MARS does; the caller stores the value in the
     * project so it comes back with it, and testcases run with it too.
     */

    interface Props {
        display: ProjectDisplay
        onChange: (display: ProjectDisplay) => void
        /**
         * Where these five values came from. `directive` means they are the program's own `@screen`
         * comment's, read by the last Build or rewritten by a change made here, which the popover
         * says so that nobody wonders why the numbers moved.
         */
        origin?: MarsDisplayOrigin
        /** The label the directive's `base=` named, when it named one rather than an address. */
        baseLabel?: string
        /** Disabled while a program owns the emulator, like the other execution-time controls. */
        disabled?: boolean
        /**
         * Given, the button calls it instead of opening the popover: the Workbench shows the form in
         * its Settings panel.
         */
        onOpen?: () => void
    }

    let {
        display,
        onChange,
        origin = 'user',
        baseLabel,
        disabled = false,
        onOpen
    }: Props = $props()

    const fromDirective = $derived(origin === 'directive')

    let open = $state(false)
    let panel: HTMLDivElement | undefined = $state()

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
        aria-expanded={onOpen ? undefined : open}
        disabled={onOpen ? false : disabled}
        onclick={() => (onOpen ? onOpen() : (open = !open))}
    >
        <Icon size={0.8}>
            <FaSlidersH />
        </Icon>
        Display
        {#if fromDirective}
            <span class="from-source" title="Set by the program's @screen comment">@</span>
        {/if}
    </button>
    {#if open}
        <div class="display-popover">
            <DisplayConfigurationForm {display} {onChange} {origin} {baseLabel} />
        </div>
    {/if}
</div>

<style lang="scss">
    .display-configuration {
        position: relative;
        display: flex;
    }

    .from-source {
        font-family: 'Fira Code', monospace;
        font-weight: bold;
        line-height: 1;
        color: var(--accent);
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
</style>
