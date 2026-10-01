<script lang="ts">
    /**
     * The Workbench on tablets and phones, after the brief
     * ([the design record](../../../../docs/design/workbench.md), Layout and behaviour). One column
     * scrolls under the top bar: the editor at a fixed height that a Build does not move, the
     * execution controls in a bar that stays in reach, the bottom panel, then the Debug session's
     * sections. A tablet keeps the rail and opens panels in a drawer beside it; a phone puts the rail
     * and the panel in a drawer from the left. There are no file tabs and no splitters, and the Debug
     * tools are always sections.
     */
    import { untrack } from 'svelte'
    import { prefersReducedMotion } from 'svelte/motion'
    import { fade } from 'svelte/transition'
    import FaAngleRight from '~icons/fa-solid/angle-right'
    import MemoryControls from '$cmp/specific/project/memory/MemoryControls.svelte'
    import MemoryVisualiser from '$cmp/specific/project/memory/MemoryRenderer.svelte'
    import { DEFAULT_MEMORY_VALUE, MEMORY_SIZE } from '$lib/Config'
    import { makeColorizedLabels } from '$lib/languages/commonLanguageFeatures.svelte'
    import { languageHasScreen } from '$lib/languages/peripherals/peripheralSet'
    import { workbenchLayout } from '$stores/workbenchLayoutStore.svelte'
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
    import { debugTools } from './debugTools'
    import { useWorkbench } from './workbenchContext'
    import type { ScreenHeader } from '$cmp/specific/project/screen/screenHeader'

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
    const bottomOpen = $derived(!workbenchLayout.isCollapsed('compact:bottom', false))
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

<div class="compact" class:phone>
    {#if !phone || !externalMenu}
        <TopBar variant={phone ? 'phone' : 'tablet'} />
    {/if}
    <div class="frame">
        {#if !phone}
            <!-- an open panel joins the rail, one card with it as on a desktop -->
            <div class="rail-slot" class:joined={panelShown}><IconRail /></div>
        {/if}
        <div class="scroll">
            <EditorArea tabs={false} style="height: var(--compact-editor-height); flex: none;" />
            <div class="controls-bar">
                <ExecutionControls fill={phone} />
            </div>
            <BottomPanel
                open={bottomOpen}
                style={bottomOpen
                    ? 'height: var(--compact-bottom-height); flex: none;'
                    : 'flex: none;'}
            >
                {#snippet actions()}
                    <button
                        class="fold"
                        title={bottomOpen ? 'Fold the panel' : 'Unfold the panel'}
                        aria-expanded={bottomOpen}
                        onclick={() => workbenchLayout.setCollapsed('compact:bottom', bottomOpen)}
                    >
                        <span class="chevron" class:open={bottomOpen}><FaAngleRight /></span>
                    </button>
                {/snippet}
            </BottomPanel>
            {#if debugSectionsBuilt}
                <div class="debug-sections" class:hidden={!session.debugSession}>
                    <CollapsibleSection id="compact:registers" title="Registers & memory">
                        <div class="registers-memory">
                            <div class="card registers">
                                <RegistersArea />
                            </div>
                            <div class="card memory">
                                <div class="memory-controls">
                                    <MemoryControls
                                        buttonVar="secondary"
                                        systemSize={emulator.systemSize}
                                        bytesPerPage={emulator.memory.global.pageSize}
                                        memorySize={MEMORY_SIZE[language]}
                                        inputStyle="height: 100%"
                                        currentAddress={emulator.memory.global.address}
                                        onAddressChange={(address) =>
                                            emulator.setGlobalMemoryAddress(address)}
                                    />
                                </div>
                                <MemoryVisualiser
                                    systemSize={emulator.systemSize}
                                    endianess={emulator.memory.global.endianess}
                                    defaultMemoryValue={DEFAULT_MEMORY_VALUE[language]}
                                    bytesPerRow={emulator.memory.global.rowSize}
                                    pageSize={emulator.memory.global.pageSize}
                                    memory={emulator.memory.global.data}
                                    currentAddress={emulator.memory.global.address}
                                    sp={emulator.sp}
                                    callStackAddresses={makeColorizedLabels(emulator.callStack)}
                                    pokeable={session.pokeable}
                                    onPoke={(address, bytes) => session.pokeMemory(address, bytes)}
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
                                bodyStyle="padding: 0.4rem; max-height: 22rem; overflow: auto;"
                            >
                                <DebugToolContent {tool} />
                            </CollapsibleSection>
                        {/each}
                    </div>
                </div>
            {/if}
        </div>
        {#if panelShown && !panelMaximized}
            <button
                class="backdrop"
                aria-label="Close the panel"
                transition:fade={{ duration: panelMaximized ? 0 : 150 }}
                onclick={closeOverlay}
            ></button>
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
        display: flex;
        flex: none;

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
        --compact-controls-height: calc(var(--wb-control-height) + 0.7rem);
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

    /* the execution controls, stuck in reach as the column scrolls: no card of their own, only the
       buttons, whose gaps let the clicks through to what scrolls under them */
    .controls-bar {
        position: sticky;
        top: var(--wb-gap);
        z-index: 4;
        flex: none;
        height: var(--compact-controls-height);
        padding: 0.35rem 0;
        pointer-events: none;
    }

    .fold {
        display: grid;
        place-items: center;
        width: 2rem;
        background: transparent;
        color: var(--secondary-text);
        cursor: pointer;
    }

    .chevron {
        display: grid;
        place-items: center;
        width: 0.8rem;
        height: 0.8rem;
        transform: rotate(-90deg);
        transition: transform 0.15s;

        &.open {
            transform: rotate(90deg);
        }
    }

    /* past about twice the screen, the Debug session's sections scroll inside themselves */
    .debug-sections.hidden {
        display: none;
    }

    .debug-sections {
        display: flex;
        flex-direction: column;
        gap: var(--wb-gap);
        flex: none;
        max-height: calc(var(--screen-height) * 1.1);
        overflow-y: auto;
    }

    /* registers beside memory, as tall as a page of memory and no taller: the registers fill that
       height and scroll inside, the row scrolls sideways when the screen is narrower than both */
    .registers-memory {
        display: grid;
        grid-template-columns: auto auto;
        gap: var(--wb-gap);
        padding: 0.3rem;
        overflow-x: auto;
    }

    .card {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        min-height: 0;
    }

    .registers {
        height: 0;
        min-height: 100%;
        min-width: 11rem;
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
        cursor: default;
    }

    /* the panel, one card with the rail: beside a tablet's rail it carries on from the rail's
       right edge; in a phone's drawer it holds the rail too, the panel ruled off from it */
    .drawer {
        position: absolute;
        z-index: 12;
        top: 0;
        bottom: 0;
        left: var(--wb-rail-width);
        display: none;
        overflow: hidden;
        background-color: var(--wb-surface);
        border: var(--wb-card-edge);
        border-left: none;
        border-radius: 0 var(--wb-radius) var(--wb-radius) 0;
        box-shadow: 0.5rem 0 2rem rgb(0 0 0 / 0.4);

        &.shown {
            display: flex;
        }

        /* fill the phone's workspace below its top strip */
        &.with-rail {
            inset: 0;
            border: none;
            border-radius: 0;
            box-shadow: none;
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
            width: calc(100% - var(--wb-rail-width));
            animation: expand-panel-width 0.2s ease;
            box-shadow: none;
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
            width: calc(100% - var(--wb-rail-width));
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
