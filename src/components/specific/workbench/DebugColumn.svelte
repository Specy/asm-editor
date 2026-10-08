<script lang="ts">
    /**
     * The right-hand column of a Debug session on desktop: registers beside memory, then the Screen,
     * then (when they are sections rather than windows) the Debug tools in one row, wrapping only
     * when the column was dragged too narrow for them. Left to itself the column is as wide as the
     * registers and a row of memory, and the registers never give up any of their width. The
     * column scrolls rather than squeezing what is under registers and memory into the height
     * left: the sections have 170vh to open into from the start, and the Screen alone is as tall as
     * it needs to fill the column's width.
     */
    import Splitter from '$cmp/shared/layout/Splitter.svelte'
    import MemoryControls from '$cmp/specific/project/memory/MemoryControls.svelte'
    import MemoryVisualiser from '$cmp/specific/project/memory/MemoryRenderer.svelte'
    import { DEFAULT_MEMORY_VALUE, MEMORY_SIZE } from '$lib/Config'
    import { makeColorizedLabels, RegisterSize } from '$lib/languages/commonLanguageFeatures.svelte'
    import { registerColumnWidth } from '$lib/languages/registerFormats'
    import { languageHasScreen } from '$lib/languages/peripherals/peripheralSet'
    import { LAYOUT_LIMITS, workbenchLayout } from '$stores/workbenchLayoutStore.svelte'
    import RegistersArea from './RegistersArea.svelte'
    import ScreenArea from './ScreenArea.svelte'
    import CollapsibleSection from './CollapsibleSection.svelte'
    import DebugToolContent from './DebugToolContent.svelte'
    import { debugTools, toolBodyStyle, toolSectionStyle } from './debugTools'
    import { useWorkbench } from './workbenchContext'
    import type { ScreenHeader } from '$cmp/specific/project/screen/screenHeader'

    interface Props {
        /** The column's width in pixels, measured, for the splitter that sets it. */
        measuredWidth?: number
    }

    let { measuredWidth = $bindable(0) }: Props = $props()

    const { session, ui } = useWorkbench()
    const emulator = session.emulator
    const language = $derived(session.project.language)
    const layout = workbenchLayout.values
    const hasScreen = $derived(languageHasScreen(language))
    const sectionsMode = $derived(!ui.floatingDebugTools)
    const hasLower = $derived(hasScreen || sectionsMode)
    const tools = $derived(debugTools(emulator.memory.tabs))
    //the grouping picked in the register panel, which is what its rows' width depends on
    let registersSize = $state(RegisterSize.Word)
    //the register column is as wide as the CPU file asks at that grouping, so the memory beside it
    //does not slide sideways as tabs are picked; a single file has no tabs and asks for its content
    const registersWidth = $derived(registerColumnWidth(emulator.registerFiles, registersSize))
    const registersStyle = $derived(
        registersWidth ? `width: ${registersWidth}; min-width: ${registersWidth};` : ''
    )
    //the Screen's size and controls, which its section shows in its own header while it is open:
    //folded, the Screen is still built but has no size to fit and nothing to show
    let screenHeader: ScreenHeader | undefined = $state()
    const screenOpen = $derived(!workbenchLayout.isCollapsed('debug:screen', true))
    let topHeight = $state(0)
    let columnHeight = $state(0)
    //left to itself the top is as tall as a whole page of memory, so neither it nor the registers
    //beside it scrolls; a person who drags the split below it decides instead
    const topStyle = $derived(
        !hasLower
            ? 'flex: 1;'
            : layout.debugTopHeight !== null
              ? `height: ${layout.debugTopHeight}px; flex: none;`
              : 'flex: none;'
    )
</script>

<aside
    class="debug-column"
    style={layout.debugWidth !== null ? `width: ${layout.debugWidth}px;` : ''}
    class:automatic={layout.debugWidth === null}
    bind:clientWidth={measuredWidth}
    bind:clientHeight={columnHeight}
    aria-label="Debugger"
>
    <div class="debug-content" class:tall={sectionsMode}>
        <div class="debug-top" style={topStyle} bind:clientHeight={topHeight}>
            <div class="card registers" style={registersStyle}>
                <RegistersArea style="flex: 1;" bind:size={registersSize} />
            </div>
            <div class="card memory">
                <div class="memory-controls">
                    <MemoryControls
                        {emulator}
                        buttonVar="secondary"
                        systemSize={emulator.systemSize}
                        bytesPerPage={emulator.memory.global.pageSize}
                        memorySize={MEMORY_SIZE[language]}
                        inputStyle="height: 100%; padding: 0 0 0 0.6rem;"
                        currentAddress={emulator.memory.global.address}
                        onAddressChange={(address) => emulator.setGlobalMemoryAddress(address)}
                    />
                </div>
                <div class="memory-grid">
                    <MemoryVisualiser
                        memoryRegions={emulator?.memoryRegions}
                        dataLabels={emulator?.dataLabels}
                        style="flex: 1 0 auto; border-bottom-left-radius: min(var(--panel-radius, 0.5rem), 0.2rem); border-bottom-right-radius: min(var(--panel-radius, 0.5rem), 0.2rem);"
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
                    />
                </div>
            </div>
        </div>
        {#if hasLower}
            <Splitter
                orientation="horizontal"
                size={layout.debugTopHeight ?? topHeight}
                min={LAYOUT_LIMITS.debugTopHeight.min}
                max={Math.max(LAYOUT_LIMITS.debugTopHeight.min, columnHeight - 80)}
                label="Resize the registers and memory"
                onResize={(size) => workbenchLayout.setDebugTopHeight(size)}
                onReset={() => workbenchLayout.setDebugTopHeight(null)}
            />
            <div class="debug-lower">
                {#if hasScreen}
                    {#if sectionsMode}
                        <CollapsibleSection
                            id="debug:screen"
                            title="Screen"
                            defaultCollapsed
                            info={screenOpen ? screenHeader?.info : undefined}
                            actions={screenOpen ? screenHeader?.actions : undefined}
                        >
                            <ScreenArea
                                style="height: 26rem; flex: none; border-radius: 0;"
                                headerless
                                onHeader={(header) => (screenHeader = header)}
                            />
                        </CollapsibleSection>
                    {:else}
                        <ScreenArea
                            style="flex: 1 0 auto; min-height: 12rem; border: var(--wb-card-edge);"
                            heightFromWidth
                        />
                    {/if}
                {/if}
                {#if sectionsMode}
                    <div class="tools-row">
                        {#each tools as tool (tool.id)}
                            <CollapsibleSection
                                id="debug:{tool.id}"
                                title={tool.title}
                                style={toolSectionStyle(tool)}
                                bodyStyle={toolBodyStyle(tool, '24rem')}
                            >
                                <DebugToolContent {tool} />
                            </CollapsibleSection>
                        {/each}
                    </div>
                {/if}
            </div>
        {/if}
    </div>
</aside>

<style lang="scss">
    /* the scrollbar keeps its room, so the content does not narrow when it starts to scroll: the
       Screen's height follows its width, and would otherwise go back and forth with it */
    .debug-column {
        display: flex;
        flex-direction: column;
        flex: none;
        min-height: 0;
        min-width: 20rem;
        max-width: 75%;
        overflow-x: hidden;
        overflow-y: auto;
        scrollbar-gutter: stable;
    }

    /* the column's scrolling content: at least as tall as the column, and 170vh when the Debug
       tools are sections, which are what that room is for */
    .debug-content {
        display: flex;
        flex-direction: column;
        flex: 1 0 auto;

        &.tall {
            min-height: 170vh;
        }
    }

    /* before it is dragged the column is as wide as the registers and a whole row of memory */
    .automatic {
        width: max-content;
    }

    /* the registers and memory; the row is as tall as memory asks, and the registers fill it
       without asking for more, their list scrolling inside when it is longer. When the column is
       narrower than both, memory gives up the width and scrolls sideways */
    .debug-top {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        column-gap: var(--wb-gap);
        min-height: 0;
    }

    .card {
        display: flex;
        flex-direction: column;
        min-height: 0;
        background-color: var(--wb-surface);
        border-radius: var(--wb-radius);
        border: var(--wb-card-edge);
        overflow: hidden;
    }

    /* no padding: the registers inset their own content, so their rules reach the card's edges.
       A single Register file has no width of its own and is as wide as its content, never less */
    .registers {
        height: 0;
        min-height: 100%;
        min-width: max-content;
    }

    /* Lines draws the rule between them that Cards leaves as a gap */
    .memory {
        min-width: 0;
        border-left: var(--wb-section-rule, none);
    }

    /* the address controls are ruled off from the page under them, from edge to edge of the card.
       The page fills the height left under them, its rows sharing it, and scrolls when that is
       less than its rows need */
    .memory-grid {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        overflow: auto;
        padding: 0.3rem;
    }

    /* grows with what is open in it, the column being the one thing that scrolls. Its width is
       the column's and never the other way round: the column fits the registers and memory, and
       the Screen and the Debug tools lay out in whatever that leaves */
    .debug-lower {
        display: flex;
        flex-direction: column;
        gap: var(--wb-gap);
        flex: 1 0 auto;
        min-height: 12rem;
        contain: inline-size;
    }

    /* each section is as tall as what it holds, not as the tallest in its row */
    .tools-row {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        gap: var(--wb-gap);

        /* Lines draws each section's own rule on its right, where Cards has the gap */
        :global(.collapsible) {
            border-right: var(--wb-section-rule, none);
        }
    }

    .memory-controls {
        display: flex;
        flex: none;
        gap: 0.4rem;
        padding: 0.3rem;
        border-bottom: 1px solid var(--wb-line);
    }
</style>
