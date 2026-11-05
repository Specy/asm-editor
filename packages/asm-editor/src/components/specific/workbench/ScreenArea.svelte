<script lang="ts">
    /**
     * The Screen Peripheral's panel. Its Display button opens the Display section of Settings, where
     * a MIPS, RISC-V or x86 Program's Display configuration is edited outside a Debug session. In a
     * folding section it draws no header of its own and hands its size and controls to the
     * section's.
     */
    import ScreenRenderer from '#cmp/specific/project/screen/ScreenRenderer.svelte'
    import ScreenDisplayConfiguration from '#cmp/specific/project/screen/ScreenDisplayConfiguration.svelte'
    import type { ScreenHeader } from '#cmp/specific/project/screen/screenHeader.ts'
    import { X86_INPUT_INTERRUPT } from '#lib/languages/peripherals/x86Input.ts'
    import { useWorkbench } from './workbenchContext'

    interface Props {
        style?: string
        /** See `ScreenRenderer`: the container draws the header from what `onHeader` is given. */
        headerless?: boolean
        onHeader?: (header: ScreenHeader | undefined) => void
        /** See `ScreenRenderer`: at least as tall as the Screen needs to fill the width. */
        heightFromWidth?: boolean
    }

    let {
        style = 'height: 26rem; flex: none;',
        headerless = false,
        onHeader,
        heightFromWidth = false
    }: Props = $props()

    const context = useWorkbench()
    const { session, ui } = context
    const emulator = session.emulator
    //without a Settings panel (the exam's) the button keeps its own popover
    const hasSettings = $derived(context.rail.some((entry) => entry.id === 'settings'))
    //x86 reads the Screen's keys and pointer as Linux input events
    const x86Input = $derived(
        session.project.language === 'X86' ? emulator.peripherals.x86Input : undefined
    )
    //an x86 program waiting for nothing but a key or the pointer
    const waitingFor = $derived(
        emulator.interrupt?.type === X86_INPUT_INTERRUPT ? emulator.interrupt.message : undefined
    )
</script>

<ScreenRenderer
    name={session.project.language}
    screen={emulator.peripherals.screen}
    keyboard={emulator.peripherals.keyboard}
    mouse={emulator.peripherals.mouse}
    {x86Input}
    {waitingFor}
    {style}
    {headerless}
    {onHeader}
    {heightFromWidth}
    windowRequested={ui.screenWindowRequested}
    onWindowRequestAnswered={() => (ui.screenWindowRequested = false)}
>
    {#snippet configuration()}
        {#if session.configurableDisplay}
            <ScreenDisplayConfiguration
                display={session.currentDisplay}
                origin={session.displayOrigin}
                baseLabel={session.displayBaseLabel}
                onChange={(next) => session.applyDisplay(next)}
                onOpen={hasSettings ? () => ui.openSettings('display') : undefined}
                disabled={session.fileSystemLocked}
            />
        {/if}
    {/snippet}
</ScreenRenderer>
