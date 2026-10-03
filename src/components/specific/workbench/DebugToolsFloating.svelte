<script lang="ts">
    /**
     * The Debug tools as floating windows, the way the editor always had them: three bars floating
     * over the top of the Workbench, each dragged by its grip and opened or folded by a click on it
     * or on its eye. Where each was left and whether it is open are remembered per person.
     */
    import ToggleableDraggable from '$cmp/shared/draggable/DraggableContainer.svelte'
    import CallStack from '$cmp/specific/project/user-tools/CallStack.svelte'
    import MutationsViewer from '$cmp/specific/project/user-tools/MutationsRenderer.svelte'
    import StackPointerView from '$cmp/specific/project/memory/StackPointerView.svelte'
    import { DEFAULT_MEMORY_VALUE, MEMORY_SIZE } from '$lib/Config'
    import { makeColorizedLabels } from '$lib/languages/commonLanguageFeatures.svelte'
    import { workbenchLayout, type FloatingWindowState } from '$stores/workbenchLayoutStore.svelte'
    import { useWorkbench } from './workbenchContext'

    interface Props {
        headerHeight?: number
    }

    let { headerHeight = 0 }: Props = $props()

    const { session, ui } = useWorkbench()
    const emulator = session.emulator
    const language = $derived(session.project.language)

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

<ToggleableDraggable
    title="Call stack"
    hiddenOnMobile={false}
    bind:hidden={
        () => !windowOf('callstack').open, (hidden) => update('callstack', 0, { open: !hidden })
    }
    bind:left={() => windowOf('callstack').left, (left) => update('callstack', 0, { left })}
    bind:top={() => windowOf('callstack').top, (top) => update('callstack', 0, { top })}
>
    <CallStack
        stack={emulator.callStack}
        onGoToInstruction={(address) => {
            const location = emulator.getSourceLocationFromAddress(address)
            if (!location) return
            void session.revealSourceLocation(location.file, location.line)
        }}
        onGoToLabel={(label) => {
            if (!label.file) return
            void session.revealSourceLocation(label.file, label.line)
        }}
    />
</ToggleableDraggable>

<ToggleableDraggable
    title="History"
    hiddenOnMobile={false}
    bind:hidden={
        () => !windowOf('history').open, (hidden) => update('history', 0, { open: !hidden })
    }
    bind:left={() => windowOf('history').left, (left) => update('history', 0, { left })}
    bind:top={() => windowOf('history').top, (top) => update('history', 0, { top })}
>
    <MutationsViewer
        {language}
        statusRegisterNames={emulator.statusRegisters.map((r) => r.name)}
        on:undo={(e) => session.undoSteps(e.detail)}
        on:highlight={(e) => {
            const step = e.detail
            if (!step.file) return
            void session.revealSourceLocation(step.file, step.line, 0)
        }}
        steps={emulator.latestSteps}
    />
</ToggleableDraggable>

{#each emulator.memory.tabs as tab, index (tab.id)}
    {@const id = `memory-${tab.id}`}
    <ToggleableDraggable
        title="Stack pointer"
        hiddenOnMobile={false}
        bind:hidden={
            () => !windowOf(id, index).open, (hidden) => update(id, index, { open: !hidden })
        }
        bind:left={() => windowOf(id, index).left, (left) => update(id, index, { left })}
        bind:top={() => windowOf(id, index).top, (top) => update(id, index, { top })}
    >
        <div class="window-body">
            <StackPointerView
                {tab}
                endianess={tab.endianess}
                defaultMemoryValue={DEFAULT_MEMORY_VALUE[language]}
                memorySize={MEMORY_SIZE[language]}
                systemSize={emulator.systemSize}
                sp={emulator.sp}
                onAddressChange={(address, tab) => emulator.setTabMemoryAddress(address, tab.id)}
                callStackAddresses={makeColorizedLabels(emulator.callStack)}
                pokeable={session.pokeable}
                onPoke={(address, bytes) => session.pokeMemory(address, bytes)}
            />
        </div>
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
