<script lang="ts">
    /**
     * The Debug tools as floating windows, the way the editor always had them: three bars floating
     * over the top of the Workbench, each dragged by its grip and opened or folded by a click on it
     * or on its eye. Where each was left and whether it is open are remembered per person.
     */
    import ToggleableDraggable from '#cmp/shared/draggable/DraggableContainer.svelte'
    import {
        workbenchLayout,
        type FloatingWindowState
    } from '#stores/workbenchLayoutStore.svelte.ts'
    import DebugToolContent from './DebugToolContent.svelte'
    import { debugTools } from './debugTools'
    import { useWorkbench } from './workbenchContext'

    interface Props {
        headerHeight?: number
    }

    let { headerHeight = 0 }: Props = $props()

    const { session, ui } = useWorkbench()
    const emulator = session.emulator

    /**
     * Center the 25.6px window bars on the host's top strip, leaving its navigation actions clear.
     * Hosts without a strip keep the original positions over the file tabs.
     */
    const TOP = $derived(
        headerHeight > 0
            ? Math.max(0, Math.round((headerHeight - 25.6) / 2))
            : ui.panelStyle === 'lines'
              ? 5
              : 9
    )
    const DEFAULT_LEFT: Record<string, number> = { callstack: 300, history: 500 }
    const PREVIOUS_TOPS = [5, 9, 13]

    function windowOf(id: string, index = 0): FloatingWindowState {
        const stored = workbenchLayout.floating(id)
        const previousLeft = DEFAULT_LEFT[id] ?? 700 + index * 300
        const left = previousLeft + (headerHeight > 0 ? 60 : 0)
        if (stored) {
            const moveToStrip = headerHeight > 0 && PREVIOUS_TOPS.includes(stored.top)
            if (moveToStrip || stored.top === 13) {
                return {
                    ...stored,
                    top: TOP,
                    left: moveToStrip && stored.left === previousLeft ? left : stored.left
                }
            }
            return stored
        }
        return { open: false, left, top: TOP }
    }

    function update(id: string, index: number, change: Partial<FloatingWindowState>) {
        workbenchLayout.setFloating(id, { ...windowOf(id, index), ...change })
    }
</script>

<!-- in the order they always had, a later window over an earlier where they overlap: the Call
     stack, the History, then the Stack pointer -->
{#each debugTools(emulator.memory.tabs).reverse() as tool (tool.id)}
    {@const index = tool.kind === 'memory' ? emulator.memory.tabs.indexOf(tool.tab) : 0}
    <ToggleableDraggable
        title={tool.title}
        hiddenOnMobile={false}
        bind:hidden={
            () => !windowOf(tool.id, index).open,
            (hidden) => update(tool.id, index, { open: !hidden })
        }
        bind:left={() => windowOf(tool.id, index).left, (left) => update(tool.id, index, { left })}
        bind:top={() => windowOf(tool.id, index).top, (top) => update(tool.id, index, { top })}
    >
        {#if tool.kind === 'memory'}
            <div class="window-body">
                <DebugToolContent {tool} docked={false} />
            </div>
        {:else}
            <DebugToolContent {tool} docked={false} />
        {/if}
    </ToggleableDraggable>
{/each}

<style lang="scss">
    /* the Stack pointer window's own body, as the editor drew it, with no padding: the view pads its
       own controls and page, ruled apart from edge to edge of the window */
    .window-body {
        background-color: var(--primary);
        color: var(--primary-text);
        max-width: 16rem;
        border-radius: 0.7rem;
        box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);
        border-top-left-radius: 0;
        border-top-right-radius: 0;
    }
</style>
