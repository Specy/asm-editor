<script lang="ts">
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import FaSlidersH from '~icons/fa-solid/sliders-h'
    import type { MarsDisplayOrigin } from '#lib/languages/mars/marsDisplay.ts'
    import { isMarsDisplay, type ProgramDisplay } from '#lib/languages/programDisplay.ts'
    import DisplayConfigurationForm from './DisplayConfigurationForm.svelte'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import PopoverOutline from '#cmp/shared/floating/PopoverOutline.svelte'

    /**
     * The Display configuration of the MIPS, RISC-V and x86 Screen panel: MARS's and RARS's own
     * five bitmap display parameters, with their choice lists and their defaults, or the size of
     * x86's framebuffer. It renders into the panel header's configuration slot.
     *
     * The user configures these, as in MARS's own settings window, unless the program says what it
     * wants in a `@screen` comment, which every Build reads. Either way a change is applied at once,
     * the MIPS and RISC-V Screen re-syncing from memory as MARS does; the caller stores the value in
     * the project so it comes back with it, and testcases run with it too.
     */

    interface Props {
        display: ProgramDisplay
        onChange: (display: ProgramDisplay) => void
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
    const parameters = $derived(
        isMarsDisplay(display) ? 'Bitmap display parameters' : 'Framebuffer size'
    )

    let open = $state(false)
    let panel: HTMLDivElement | undefined = $state()
    let buttonWidth = $state(0)
    let popoverWidth = $state(0)
    let popoverHeight = $state(0)

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
        bind:offsetWidth={buttonWidth}
        {@attach tooltip(
            fromDirective ? `${parameters}, set by the program's @screen comment` : parameters
        )}
        aria-expanded={onOpen ? undefined : open}
        disabled={onOpen ? false : disabled}
        onclick={() => (onOpen ? onOpen() : (open = !open))}
    >
        <Icon size="small">
            <FaSlidersH />
        </Icon>
        Display
        {#if fromDirective}
            <span class="from-source">@</span>
        {/if}
    </button>
    {#if open}
        <!-- under the button, against its right end: the arrow on the button's middle -->
        <div
            class="display-popover"
            bind:offsetWidth={popoverWidth}
            bind:offsetHeight={popoverHeight}
        >
            <PopoverOutline
                width={popoverWidth}
                height={popoverHeight}
                side="bottom"
                at={popoverWidth - buttonWidth / 2}
            />
            <DisplayConfigurationForm {display} {onChange} {origin} {baseLabel} />
        </div>
    {/if}
</div>

<style lang="scss">
    @use '../../../../styles/popover.scss';
    @use '../../../shared/button/tray.scss';

    .display-configuration {
        position: relative;
        display: flex;
    }

    .from-source {
        font-family: var(--font-mono);
        font-weight: 700;
        line-height: 1;
        color: var(--accent);
    }

    /* a ghost, as the Screen bar's other controls are (D5); measured for the Popover's arrow, so
       not a Button component */
    .display-button {
        @include tray.tool-face;
        display: flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.15rem 0.4rem;
        border: 1px solid transparent;
        font-size: var(--fs-small);
        color: inherit;
    }

    /* PopoverOutline's arrow, which stands out of it towards the button */
    $arrow: popover.$arrow;

    /* a Popover, as the menus are: its outline, arrow and all, is drawn behind it, so it draws no
       surface of its own; the padding keeps the room the edge takes */
    .display-popover {
        @include popover.content;
        position: absolute;
        top: calc(100% + 0.3rem + #{$arrow});
        right: 0;
        z-index: var(--z-window);
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        width: 18rem;
        max-width: calc(100vw - 2rem);
        padding: calc(0.7rem + 1px);

        /* the size field, --tertiary as the Popover is, edged where it sits on it */
        :global(.custom-size .stepper) {
            border: 1px solid var(--line);
        }
    }
</style>
