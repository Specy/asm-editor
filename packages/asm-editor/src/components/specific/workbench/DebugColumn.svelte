<script lang="ts" module>
    /** The width of the strip the column collapses to, in pixels. */
    export const DEBUG_STRIP_WIDTH = 32
</script>

<script lang="ts">
    /**
     * The right-hand column of a Debug session on desktop: registers beside memory, then the Screen,
     * then (when they are sections rather than windows) the Debug tools in one row, wrapping only
     * when the column was dragged too narrow for them. Left to itself the column is as wide as the
     * registers and a row of memory, and the registers never give up any of their width. The
     * column scrolls rather than squeezing what is under registers and memory into the height
     * left: the sections have 170vh to open into from the start, and the Screen alone is as tall as
     * it needs to fill the column's width.
     *
     * It collapses to a strip that stays at the Workbench's right edge
     * ([the design record](../../../../../../docs/design/reverse-engineering-ux.md), decision 19),
     * from the button at the end of memory's controls or by dragging its splitter, and the strip
     * opens it again at the width it had. Collapsed, the column is only hidden, so nothing in it
     * is built anew, and its width, the registers' included, takes no room.
     */
    import { tick } from 'svelte'
    import Splitter from '#cmp/shared/layout/Splitter.svelte'
    import MemoryControls from '#cmp/specific/project/memory/MemoryControls.svelte'
    import MemoryVisualiser from '#cmp/specific/project/memory/MemoryRenderer.svelte'
    import { DEFAULT_MEMORY_VALUE, MEMORY_SIZE } from '#lib/Config.ts'
    import {
        makeColorizedLabels,
        RegisterSize
    } from '#lib/languages/commonLanguageFeatures.svelte.ts'
    import { registerColumnWidth } from '#lib/languages/registerFormats.ts'
    import { languageHasScreen } from '#lib/languages/peripherals/peripheralSet.ts'
    import { LAYOUT_LIMITS, workbenchLayout } from '#stores/workbenchLayoutStore.svelte.ts'
    import RegistersArea from './RegistersArea.svelte'
    import ScreenArea from './ScreenArea.svelte'
    import CollapsibleSection from './CollapsibleSection.svelte'
    import DebugToolContent from './DebugToolContent.svelte'
    import { debugTools, toolBodyStyle, toolSectionStyle } from './debugTools'
    import { markedMemoryAddress, memoryCellMenu, moveMemoryView } from './pointerMenu'
    import { useWorkbench } from './workbenchContext'
    import type { ScreenHeader } from '#cmp/specific/project/screen/screenHeader.ts'
    import FaAngleDoubleLeft from '~icons/fa-solid/angle-double-left'
    import FaAngleDoubleRight from '~icons/fa-solid/angle-double-right'

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
    //what the strip names: everything collapsing hides, which is the Screen in a Target that has
    //one and the Debug tools while they are sections here rather than windows of their own
    const stripLabel = $derived(
        [
            'Registers',
            'Memory',
            ...(hasScreen ? ['Screen'] : []),
            ...(sectionsMode ? tools.map((tool) => tool.title) : [])
        ].join(' · ')
    )
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
    //left to itself the top is as tall as a whole page of memory or the registers beside it, so
    //neither scrolls (see .registers); a person who drags the split below it decides instead
    const topStyle = $derived(
        !hasLower
            ? 'flex: 1;'
            : layout.debugTopHeight !== null
              ? `height: ${layout.debugTopHeight}px; flex: none;`
              : 'flex: none;'
    )

    const columnId = `debug-column-${Math.random().toString(36).slice(2, 8)}`
    let collapseButton: HTMLButtonElement | undefined = $state()
    let expandButton: HTMLButtonElement | undefined = $state()
    /** A button's collapse or opening, which hands the focus to the button that undoes it. */
    async function setCollapsed(collapsed: boolean) {
        workbenchLayout.setDebugCollapsed(collapsed)
        await tick()
        ;(collapsed ? expandButton : collapseButton)?.focus()
    }
</script>

{#if layout.debugCollapsed}
    <div class="debug-strip" style:width="{DEBUG_STRIP_WIDTH}px">
        <button
            class="strip-button"
            aria-expanded="false"
            aria-controls={columnId}
            title="Show the registers and memory"
            bind:this={expandButton}
            onclick={() => setCollapsed(false)}
        >
            <FaAngleDoubleLeft />
            <span class="strip-label">{stripLabel}</span>
        </button>
    </div>
{/if}

<aside
    id={columnId}
    class="debug-column"
    style={layout.debugWidth !== null ? `width: ${layout.debugWidth}px;` : ''}
    class:automatic={layout.debugWidth === null}
    class:collapsed={layout.debugCollapsed}
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
                        onAddressChange={(address) => moveMemoryView(session, ui, address)}
                        hideLabel={emulator.memory.global.rowSize < 16}
                    />
                    <button
                        class="collapse-button"
                        aria-expanded="true"
                        aria-controls={columnId}
                        title="Collapse the registers and memory"
                        bind:this={collapseButton}
                        onclick={() => setCollapsed(true)}
                    >
                        <FaAngleDoubleRight />
                    </button>
                </div>
                <div class="memory-grid">
                    <MemoryVisualiser
                        memoryRegions={emulator?.memoryRegions}
                        dataLabels={emulator?.dataLabels}
                        readOnlyMemory={emulator?.readOnlyMemory}
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
                        cellMenu={(cell) => memoryCellMenu(session, ui, cell)}
                        markedAddress={markedMemoryAddress(session, ui)}
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
                                bodyStyle={toolBodyStyle('24rem')}
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

        /* collapsed to its strip: still built, and none of its widths, the registers' lock
           included, holds the Workbench open */
        &.collapsed {
            display: none;
        }
    }

    /* the collapsed column, a card as tall as the column was, which opens it again from anywhere
       along it */
    .debug-strip {
        display: flex;
        flex: none;
        min-height: 0;
        background-color: var(--wb-surface);
        border-radius: var(--wb-radius);
        border: var(--wb-card-edge);
        overflow: hidden;
    }

    .strip-button {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.6rem;
        width: 100%;
        padding: 0.6rem 0;
        border: none;
        background: transparent;
        color: var(--secondary-text);
        font: inherit;
        font-size: 0.8rem;
        cursor: pointer;

        :global(svg) {
            flex: none;
            width: 0.8rem;
            height: 0.8rem;
        }

        &:hover {
            background-color: color-mix(in srgb, var(--accent) 15%, transparent);
        }

        &:focus-visible {
            outline: solid 0.1rem var(--accent);
            outline-offset: -0.2rem;
        }
    }

    /* read top to bottom, as a collapsed panel's title is in an IDE, and cut short with an
       ellipsis when the column is shorter than all it names */
    .strip-label {
        writing-mode: vertical-rl;
        white-space: nowrap;
        min-height: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        opacity: 0.85;
    }

    /* the column's own control, ruled off from memory's page buttons before it so that its
       arrows do not read as one more page: a narrow strip from the card's top edge down to the
       controls' rule, flush with the card's right edge */
    .collapse-button {
        display: grid;
        place-items: center;
        flex: none;
        width: 2.5rem;
        margin: -0.3rem -0.3rem -0.3rem 0;
        padding: 0;
        border: none;
        border-left: 1px solid var(--wb-line, var(--tertiary));
        border-radius: 0;
        background: transparent;
        color: var(--secondary-text);
        cursor: pointer;

        :global(svg) {
            width: 0.8rem;
            height: 0.8rem;
        }

        &:hover {
            background-color: color-mix(in srgb, var(--accent) 15%, transparent);
        }

        &:focus-visible {
            outline: solid 0.1rem var(--accent);
            outline-offset: -0.1rem;
        }
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

    /* the registers and memory; the row is as tall as the taller of them asks, the registers up to
       their cap, their list scrolling inside when it is longer. When the column is
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
       A single Register file has no width of its own and is as wide as its content, never less.
       Left to itself the row is also as tall as the registers, up to a page of memory and a few
       rows more: M68K's flags and x86's files fit without scrolling, while the 32 registers of
       MIPS and RISC-V scroll rather than stretch memory's rows to their length. A dragged row
       has its own height, which they fill whatever the cap */
    .registers {
        max-height: 38rem;
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
