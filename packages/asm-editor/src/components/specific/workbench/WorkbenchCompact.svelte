<script lang="ts">
    /**
     * The Workbench on tablets and phones, after the brief
     * ([the design record](../../../../../../docs/design/workbench.md), Layout and behaviour). One column
     * scrolls, on a phone under the top bar: the editor at a fixed height that a Build does not
     * move, the execution controls in a bar across it that stays in reach (on a phone along the
     * editor's bottom edge instead), the bottom panel, then
     * the Debug session's sections. A tablet keeps the rail, with Back and Save in it as on a
     * desktop, and opens panels in a drawer beside it; a phone puts the rail and the panel in a
     * drawer from the left. Each editor keeps its file tabs; the Debug tools are sections.
     */
    import { untrack } from 'svelte'
    import { sourceLanguage } from '#lib/sourceCompilation/records.ts'
    import { prefersReducedMotion } from 'svelte/motion'
    import MemoryControls from '#cmp/specific/project/memory/MemoryControls.svelte'
    import MemoryVisualiser from '#cmp/specific/project/memory/MemoryRenderer.svelte'
    import { DEFAULT_MEMORY_VALUE, MEMORY_SIZE } from '#lib/Config.ts'
    import {
        makeColorizedLabels,
        RegisterSize
    } from '#lib/languages/commonLanguageFeatures.svelte.ts'
    import { registerColumnWidth } from '#lib/languages/registerFormats.ts'
    import { languageHasScreen } from '#lib/languages/peripherals/peripheralSet.ts'
    import { workbenchLayout } from '#stores/workbenchLayoutStore.svelte.ts'
    import TopBar from './TopBar.svelte'
    import IconRail from './IconRail.svelte'
    import SidePanel from './SidePanel.svelte'
    import EditorArea from './EditorArea.svelte'
    import BottomPanel from './BottomPanel.svelte'
    import ExecutionControls from './ExecutionControls.svelte'
    import RegistersArea from './RegistersArea.svelte'
    import ScreenArea from './ScreenArea.svelte'
    import CollapsibleSection from './CollapsibleSection.svelte'
    import DebugToolContent from './DebugToolContent.svelte'
    import { debugTools, toolBodyStyle } from './debugTools'
    import { markedMemoryAddress, memoryCellMenu, moveMemoryView } from './pointerMenu'
    import { useWorkbench } from './workbenchContext'
    import type { ScreenHeader } from '#cmp/specific/project/screen/screenHeader.ts'

    interface Props {
        externalMenu?: boolean
    }

    let { externalMenu = false }: Props = $props()

    const context = useWorkbench()
    const { session, ui } = context
    const emulator = session.emulator
    const language = $derived(session.project.language)
    const phone = $derived(ui.deviceClass === 'phone')
    const hasScreen = $derived(languageHasScreen(language))
    const tools = $derived(debugTools(emulator.memory.tabs))
    //the registers are as wide as the CPU file asks at the grouping picked, as in the desktop's
    //column, and never give up any of it; a single file has no tabs and asks for its content
    let registersSize = $state(RegisterSize.Word)
    const registersWidth = $derived(registerColumnWidth(emulator.registerFiles, registersSize))
    //a page of memory, which the registers fill beside it and are no taller than under it
    let memoryBox: readonly ResizeObserverSize[] | undefined = $state()
    const memoryHeight = $derived(memoryBox?.[0]?.blockSize ?? 0)
    const firstPanel = $derived(context.rail.find((entry) => !entry.action)?.id)
    const panelShown = $derived(phone ? ui.drawerOpen : !!ui.activePanel)
    let restoring = $state(false)
    let wasMaximized = untrack(() => ui.maximized && !phone && !!ui.activePanel)
    const panelMaximized = $derived(!phone && (ui.maximized || restoring))

    $effect(() => {
        const maximized = ui.maximized && !phone && !!ui.activePanel
        if (maximized || !ui.activePanel || phone || prefersReducedMotion.current) restoring = false
        else if (wasMaximized) restoring = true
        wasMaximized = maximized
    })
    //the Screen's size and controls, which its section shows in its own header while it is open
    let screenHeader: ScreenHeader | undefined = $state()
    const screenOpen = $derived(!workbenchLayout.isCollapsed('compact:screen', true))
    //the bar builds the controls group's Program (programs-plan.md, decision 8), so it is there
    //while that pane shows an Entry file that is no C or C++, whose pane has Compile instead
    const executionBar = $derived(
        session.debugSession ||
            (session.controlsGroup.displayedProgram !== undefined &&
                !sourceLanguage(session.controlsGroup.displayedPath))
    )
    //the Debug session's sections are built at the first Build and only hidden after a Stop
    let debugged = false
    const debugSectionsBuilt = $derived.by(() => {
        if (session.debugSession) debugged = true
        return debugged
    })

    //a phone's drawer always shows a panel beside its rail: the last one, or the first there is
    $effect(() => {
        if (phone && ui.drawerOpen && !ui.activePanel && firstPanel) ui.open(firstPanel)
    })

    function closeOverlay() {
        if (phone) ui.drawerOpen = false
        else ui.close()
    }
</script>

<div class="compact" class:phone class:no-controls-bar={!executionBar}>
    {#if phone && !externalMenu}
        <TopBar />
    {/if}
    <div class="frame">
        {#if !phone}
            <!-- an open panel joins the rail, one card with it as on a desktop; with no top bar,
                 Back and Save are in the rail as on a desktop too -->
            <div class="rail-slot" class:joined={panelShown}><IconRail withBack withSave /></div>
        {/if}
        <div class="scroll">
            <!-- a phone's controls are inside the editor, along its bottom edge -->
            <EditorArea
                controls={phone}
                fill={phone}
                style="height: var(--compact-editor-height); flex: none;"
            />
            {#if !phone && executionBar}
                <div class="controls-bar">
                    <ExecutionControls
                        fill
                        group={session.controlsGroup}
                        showCompilation={false}
                        showViews={false}
                    />
                </div>
            {/if}
            <!-- Lines rules it off from the editor and the controls above it, where Cards has the gap -->
            <BottomPanel
                style="height: var(--compact-bottom-height); flex: none; border-top: var(--wb-section-rule, none);"
            />
            {#if debugSectionsBuilt}
                <div class="debug-sections" class:hidden={!session.debugSession}>
                    <CollapsibleSection id="compact:registers" title="Registers & memory">
                        <div class="registers-memory">
                            <div
                                class="card registers"
                                style:width={registersWidth || undefined}
                                style:min-width={registersWidth || undefined}
                                style:max-height={memoryHeight ? `${memoryHeight}px` : undefined}
                            >
                                <RegistersArea style="flex: 1;" bind:size={registersSize} />
                            </div>
                            <div class="card memory" bind:borderBoxSize={memoryBox}>
                                <div class="memory-controls">
                                    <MemoryControls
                                        {emulator}
                                        buttonVar="secondary"
                                        systemSize={emulator.systemSize}
                                        bytesPerPage={emulator.memory.global.pageSize}
                                        memorySize={MEMORY_SIZE[language]}
                                        inputStyle="height: 100%; padding: 0 0 0 0.6rem;"
                                        currentAddress={emulator.memory.global.address}
                                        onAddressChange={(address) =>
                                            moveMemoryView(session, ui, address)}
                                        hideLabel={emulator.memory.global.rowSize < 16}
                                    />
                                </div>
                                <MemoryVisualiser
                                    memoryRegions={emulator?.memoryRegions}
                                    dataLabels={emulator?.dataLabels}
                                    readOnlyMemory={emulator?.readOnlyMemory}
                                    systemSize={emulator.systemSize}
                                    endianess={emulator.memory.global.endianess}
                                    memorySize={MEMORY_SIZE[language]}
                                    dense
                                    defaultMemoryValue={DEFAULT_MEMORY_VALUE[language]}
                                    bytesPerRow={emulator.memory.global.rowSize}
                                    pageSize={emulator.memory.global.pageSize}
                                    memory={emulator.memory.global.data}
                                    currentAddress={emulator.memory.global.address}
                                    sp={emulator.sp}
                                    callStackAddresses={makeColorizedLabels(emulator.callStack)}
                                    pokeable={session.pokeable}
                                    onPoke={(address, bytes) => session.pokeMemory(address, bytes)}
                                    cellMenu={(cell) => memoryCellMenu(session, ui, cell)}
                                    markedAddress={markedMemoryAddress(session, ui)}
                                />
                            </div>
                        </div>
                    </CollapsibleSection>
                    {#if hasScreen}
                        <CollapsibleSection
                            id="compact:screen"
                            title="Screen"
                            defaultCollapsed
                            info={screenOpen ? screenHeader?.info : undefined}
                            actions={screenOpen ? screenHeader?.actions : undefined}
                        >
                            <ScreenArea
                                style="height: 22rem; flex: none; border-radius: 0;"
                                headerless
                                onHeader={(header) => (screenHeader = header)}
                            />
                        </CollapsibleSection>
                    {/if}
                    <div class="tools-row">
                        {#each tools as tool (tool.id)}
                            <CollapsibleSection
                                id="compact:{tool.id}"
                                title={tool.title}
                                style="flex: 1 1 16rem; min-width: min(16rem, 100%);"
                                bodyStyle={toolBodyStyle('22rem')}
                            >
                                <DebugToolContent {tool} />
                            </CollapsibleSection>
                        {/each}
                    </div>
                </div>
            {/if}
        </div>
        {#if panelShown && !panelMaximized}
            <button class="backdrop" aria-label="Close the panel" onclick={closeOverlay}></button>
        {/if}
        <div
            class="drawer"
            class:shown={panelShown}
            class:with-rail={phone}
            class:maximized={panelMaximized}
            class:restoring
            inert={!panelShown}
            aria-hidden={!panelShown}
            style:--side-panel-width={`min(${workbenchLayout.panelWidth(ui.activePanel ?? '')}px, calc(100% - var(--wb-rail-width) - 2rem))`}
            style={phone || panelMaximized ? '' : 'width: var(--side-panel-width)'}
            onanimationend={(event) => {
                if (event.target === event.currentTarget) restoring = false
            }}
        >
            {#if phone}
                <IconRail withBack withSave={externalMenu} framed={false} />
            {/if}
            {#if ui.opened.size > 0}
                <div class="drawer-panel" class:hidden={!ui.activePanel}>
                    <SidePanel allowMaximize={!phone} framed={false} {restoring} />
                </div>
            {/if}
        </div>
    </div>
</div>

<style lang="scss">
    .compact {
        position: relative;
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        height: 100%;
    }

    .frame {
        position: relative;
        display: flex;
        flex: 1;
        min-height: 0;
    }

    .rail-slot {
        /* keep the tablet's rail beside its drawer, above the backdrop */
        position: relative;
        z-index: 12;
        display: flex;
        flex: none;
        margin: var(--wb-gap) 0 var(--wb-gap) var(--wb-gap);

        /* the open panel carries on from the rail's right edge, whose rule divides the two */
        &.joined :global(.icon-rail) {
            border-top-right-radius: 0;
            border-bottom-right-radius: 0;
        }
    }

    /* Before a Build the editor, the controls bar and the open bottom panel fill the column exactly,
       so nothing scrolls while writing; the editor keeps that height after a Build, the Debug
       session's sections going below it. The column is a size container so the height comes from
       the room actually left under whatever bars sit above the Workbench, not from guessing them. */
    .scroll {
        --compact-bottom-height: 12rem;
        --compact-controls-height: calc(var(--wb-control-height) + 0.4rem);
        --compact-editor-height: max(
            14rem,
            calc(
                100cqh - 2 *
                    var(--wb-gap) - var(--compact-controls-height) - var(--compact-bottom-height)
            )
        );
        container-type: size;
        display: flex;
        flex-direction: column;
        gap: var(--wb-gap);
        flex: 1;
        min-width: 0;
        padding: var(--wb-gap);
        /* always room for the scrollbar: a Build adds the sections below the editor, and the
           scrollbar arriving with them would narrow everything above */
        overflow-y: scroll;
        overflow-x: hidden;
        overscroll-behavior: contain;
    }

    /* a phone's controls are inside the editor, so the column has no bar to leave room for */
    .phone .scroll,
    .no-controls-bar .scroll {
        --compact-controls-height: 0px;
    }

    /* the execution controls, stuck in reach as the column scrolls: no card of their own, only the
       buttons, whose gaps let the clicks through to what scrolls under them */
    .controls-bar {
        position: sticky;
        top: var(--wb-gap);
        z-index: 4;
        flex: none;
        height: var(--compact-controls-height);
        padding: 0.2rem 0;
        pointer-events: none;
        /* out among the cards rather than over the code */
        --execution-tray: var(--wb-surface);
    }

    .debug-sections.hidden {
        display: none;
    }

    /* the sections grow with what is open in them: the column is what scrolls, never them */
    .debug-sections {
        display: flex;
        flex-direction: column;
        gap: var(--wb-gap);
        flex: none;
    }

    /* registers beside memory when both fit, memory under them when not. Beside it the registers
       fill the height of its page and scroll inside; above it they are as tall as their list, up
       to a page. Beside each other memory takes the width left, and alone on its line each fills
       it; the row scrolls sideways only when one of them is wider than the screen. A margin rather
       than padding, so the row clips at the edges of what it holds: memory's rules, below */
    .registers-memory {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem var(--wb-gap);
        margin: 0.3rem;
        overflow-x: auto;
    }

    .card {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        min-height: 0;
    }

    .registers {
        flex: 1 0 auto;
        min-width: max-content;
    }

    /* never stretched to the registers' height, which is measured from this one */
    .memory {
        position: relative;
        flex: 1000 1 auto;
        align-self: flex-start;

        /* the rule from the registers, in either style: memory draws one in the gap on its left
           and one in the gap above it, and the row clips whichever falls outside it, the left one
           when memory has wrapped under the registers and the top one when it sits beside them */
        &::before,
        &::after {
            content: '';
            position: absolute;
            background-color: var(--wb-line);
            pointer-events: none;
        }

        &::before {
            top: 0;
            bottom: 0;
            left: calc(-1px - var(--wb-gap) / 2);
            width: 1px;
        }

        &::after {
            top: calc(-0.25rem - 0.5px);
            left: 0;
            right: 0;
            height: 1px;
        }
    }

    /* each section is as tall as what it holds, not as the tallest in its row */
    .tools-row {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        gap: var(--wb-gap);

        :global(.collapsible) {
            border-right: var(--wb-section-rule, none);
        }
    }

    .backdrop {
        position: absolute;
        inset: 0;
        z-index: 11;
        background-color: rgb(0 0 0 / 0.4);
        backdrop-filter: blur(1px);
        cursor: default;
    }

    /* the panel, one card with the rail: beside a tablet's rail it carries on from the rail's
       right edge; in a phone's drawer it holds the rail too, the panel ruled off from it */
    .drawer {
        position: absolute;
        z-index: 12;
        top: var(--wb-gap);
        bottom: var(--wb-gap);
        left: calc(var(--wb-gap) + var(--wb-rail-width));
        display: none;
        overflow: hidden;
        background-color: var(--wb-surface);
        border: var(--wb-card-edge);
        border-left: none;
        border-radius: 0 var(--wb-radius) var(--wb-radius) 0;

        &.shown {
            display: flex;
        }

        /* fill the phone's workspace below its top strip */
        &.with-rail {
            inset: 0;
            border: none;
            border-radius: 0;
            display: flex;
            visibility: hidden;
            pointer-events: none;
            transform: translateX(-100%);
            transition:
                transform 0.2s ease,
                visibility 0s 0.2s;

            &.shown {
                visibility: visible;
                pointer-events: auto;
                transform: translateX(0);
                transition:
                    transform 0.2s ease,
                    visibility 0s;
            }

            .drawer-panel {
                border-left: var(--wb-card-edge);
            }
        }

        &.maximized {
            width: calc(100% - var(--wb-rail-width) - 2 * var(--wb-gap));
            animation: expand-panel-width 0.2s ease;
        }

        &.restoring {
            animation: restore-panel-width 0.2s ease forwards;
        }
    }

    @keyframes expand-panel-width {
        from {
            width: var(--side-panel-width);
        }
    }

    @keyframes restore-panel-width {
        from {
            width: calc(100% - var(--wb-rail-width) - 2 * var(--wb-gap));
        }
        to {
            width: var(--side-panel-width);
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .drawer.with-rail {
            transition: none;
        }

        .drawer.with-rail.shown {
            transition: none;
        }

        .drawer.maximized {
            animation: none;
        }
    }

    .drawer-panel {
        display: flex;
        flex: 1;
        min-width: 0;
        max-width: 100%;

        &.hidden {
            display: none;
        }
    }

    .memory-controls {
        display: flex;
        flex: none;
        gap: 0.4rem;
    }
</style>
