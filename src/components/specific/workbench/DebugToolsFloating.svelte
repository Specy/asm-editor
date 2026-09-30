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

    const { session, ui } = useWorkbench()
    const emulator = session.emulator
    const language = $derived(session.project.language)

    /**
     * Where a window starts before it was ever moved: the editor's own places across, and down so
     * that its 25.6px bar is centred on the file tabs' 36px strip, which starts under the 4px gap
     * of Cards and at the very top in Lines.
     */
    const TOP = $derived(ui.panelStyle === 'lines' ? 5 : 9)
    const DEFAULT_LEFT: Record<string, number> = { callstack: 300, history: 500 }
    /** Where they started under the top bar the desktop no longer has: one left there moves up. */
    const TOP_UNDER_THE_OLD_BAR = 13

    function windowOf(id: string, index = 0): FloatingWindowState {
        const stored = workbenchLayout.floating(id)
        if (stored) return stored.top === TOP_UNDER_THE_OLD_BAR ? { ...stored, top: TOP } : stored
        return { open: false, left: DEFAULT_LEFT[id] ?? 700 + index * 300, top: TOP }
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
    /* the Stack pointer window's own body, as the editor drew it */
    .window-body {
        background-color: var(--primary);
        color: var(--primary-text);
        padding: 0.4rem;
        max-width: 16rem;
        border-radius: 0.7rem;
        box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);
        border-top-left-radius: 0;
        border-top-right-radius: 0;
    }
</style>
