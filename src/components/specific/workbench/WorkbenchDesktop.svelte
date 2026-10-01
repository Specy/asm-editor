<script lang="ts">
    /**
     * The Workbench on a desktop: the icon rail, with Back and Save, and its panel; the editor with
     * the execution controls floating over it, above the bottom panel; and while a Debug session
     * exists, the debug column. There is no top bar. Every split drags, and the sizes are
     * remembered per person ([the design record](../../../../docs/design/workbench.md)).
     */
    import { untrack } from 'svelte'
    import Splitter from '$cmp/shared/layout/Splitter.svelte'
    import { LAYOUT_LIMITS, workbenchLayout } from '$stores/workbenchLayoutStore.svelte'
    import IconRail from './IconRail.svelte'
    import SidePanel from './SidePanel.svelte'
    import EditorArea from './EditorArea.svelte'
    import BottomPanel from './BottomPanel.svelte'
    import DebugColumn from './DebugColumn.svelte'
    import DebugToolsFloating from './DebugToolsFloating.svelte'
    import { useWorkbench } from './workbenchContext'

    /** Below this, the editor beside an open panel and the debug column is too narrow to use. */
    const EDITOR_MIN_WIDTH = 360

    const { session, ui } = useWorkbench()
    const layout = workbenchLayout.values
    let bodyWidth = $state(0)
    let railWidth = $state(0)
    let bodyHeight = $state(0)
    let mainHeight = $state(0)
    let debugWidth = $state(0)

    const panelId = $derived(ui.activePanel)
    const panelWidth = $derived(panelId ? workbenchLayout.panelWidth(panelId) : 0)
    const hasOpened = $derived(ui.opened.size > 0)
    //the debug column and the floating Debug tools are built at the first Build and only hidden
    //after a Stop, so the next Build shows them at once instead of building them anew
    let debugged = false
    const debugUiBuilt = $derived.by(() => {
        if (session.debugSession) debugged = true
        return debugged
    })

    //A Build at a narrow desktop width closes the side panel to make room for the debug column.
    //A test run builds each Testcase on the same Emulator, which is no Build of the person's: it
    //leaves the panel open, since Run all is pressed in the Testcases panel to see its results there
    let wasDebugging = untrack(() => session.debugSession)
    $effect(() => {
        const debugging = session.debugSession
        if (debugging && !wasDebugging && !session.testing) {
            untrack(() => {
                if (!ui.activePanel) return
                const debugColumn = layout.debugWidth ?? 720
                if (bodyWidth - railWidth - panelWidth - debugColumn < EDITOR_MIN_WIDTH) ui.close()
            })
        }
        wasDebugging = debugging
    })
</script>

<div class="desktop">
    <div class="body" bind:clientWidth={bodyWidth} bind:clientHeight={bodyHeight}>
        <!-- the rail and its open panel are one card, the panel ruled off from the rail -->
        <div class="rail-card" class:alone={!panelId}>
            <div class="rail-slot" bind:clientWidth={railWidth}>
                <IconRail withBack withSave framed={false} />
            </div>
            {#if hasOpened}
                {#if ui.maximized && panelId}
                    <!-- keeps the layout underneath as it was while the panel is drawn over it -->
                    <div class="placeholder" style="width: {panelWidth}px"></div>
                {/if}
                <div
                    class="side-slot"
                    class:hidden={!panelId}
                    class:maximized={ui.maximized && !!panelId}
                    style={ui.maximized ? '' : `width: ${panelWidth}px`}
                >
                    <SidePanel framed={false} />
                </div>
            {/if}
        </div>
        {#if hasOpened}
            {#if panelId}
                <Splitter
                    orientation="vertical"
                    size={panelWidth}
                    min={LAYOUT_LIMITS.panelWidth.min}
                    max={Math.max(LAYOUT_LIMITS.panelWidth.min, bodyWidth - 600)}
                    label="Resize the panel"
                    onResize={(size) => panelId && workbenchLayout.setPanelWidth(panelId, size)}
                />
            {/if}
        {/if}
        <div class="main" bind:clientHeight={mainHeight}>
            <EditorArea style="flex: 1;" controls />
            <Splitter
                orientation="horizontal"
                size={layout.bottomHeight}
                direction={-1}
                min={LAYOUT_LIMITS.bottomHeight.min}
                max={Math.max(LAYOUT_LIMITS.bottomHeight.min, mainHeight - 160)}
                label="Resize the terminal"
                onResize={(size) => workbenchLayout.setBottomHeight(size)}
            />
            <BottomPanel style="height: {layout.bottomHeight}px; flex: none;" />
        </div>
        {#if debugUiBuilt}
            <div class="debug-slot" class:hidden={!session.debugSession}>
                <Splitter
                    orientation="vertical"
                    size={layout.debugWidth ?? debugWidth}
                    direction={-1}
                    min={LAYOUT_LIMITS.debugWidth.min}
                    max={Math.max(LAYOUT_LIMITS.debugWidth.min, bodyWidth - 480)}
                    label="Resize the debugger"
                    onResize={(size) => workbenchLayout.setDebugWidth(size)}
                    onReset={() => workbenchLayout.setDebugWidth(null)}
                />
                <DebugColumn bind:measuredWidth={debugWidth} />
            </div>
        {/if}
    </div>
    <!-- the floating Debug tools belong to a Debug session: nothing to show before a Build -->
    {#if ui.floatingDebugTools && debugUiBuilt}
        <div class="debug-slot" class:hidden={!session.debugSession}>
            <DebugToolsFloating />
        </div>
    {/if}
</div>

<style lang="scss">
    .desktop {
        position: relative;
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
    }

    .body {
        position: relative;
        display: flex;
        flex: 1;
        min-height: 0;
        padding: var(--wb-gap);
    }

    /* the rail and its open panel, one card; it keeps the gap to the editor only as the rail
       alone, the panel's splitter being that gap otherwise */
    .rail-card {
        display: flex;
        flex: none;
        min-height: 0;
        background-color: var(--wb-surface);
        border-radius: var(--wb-radius);
        border: var(--wb-card-edge);
        overflow: hidden;

        &.alone {
            margin-right: var(--wb-gap);
        }
    }

    .rail-slot {
        display: flex;
        flex: none;
    }

    /* ruled off from the rail from top to bottom; Lines has the rail's own rule there */
    .side-slot {
        display: flex;
        flex: none;
        min-height: 0;
        border-left: var(--wb-card-edge);

        &.hidden {
            display: none;
        }

        /* still joined to the rail, running on over the rest of the Workbench */
        &.maximized {
            position: absolute;
            z-index: 11;
            top: var(--wb-gap);
            bottom: var(--wb-gap);
            right: var(--wb-gap);
            left: calc(var(--wb-gap) + var(--wb-card-inset) + var(--wb-rail-width));
            overflow: hidden;
            background-color: var(--wb-surface);
            border-radius: 0 var(--wb-radius) var(--wb-radius) 0;
            border: var(--wb-card-edge);
            box-shadow: 0.5rem 0.5rem 2rem rgb(0 0 0 / 0.4);
        }
    }

    .placeholder {
        flex: none;
    }

    /* a Debug session's own parts, the column and its splitter or the floating Debug tools: laid
       out as if the wrapper were not there, and hidden while there is no session */
    .debug-slot {
        display: contents;

        &.hidden {
            display: none;
        }
    }

    .main {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
        min-height: 0;
    }
</style>
