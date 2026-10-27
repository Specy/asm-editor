<script lang="ts">
    /** What one Debug tool shows, wherever it is: a floating window, a section, a compact row. */
    import CallStack from '#cmp/specific/project/user-tools/CallStack.svelte'
    import MutationsViewer from '#cmp/specific/project/user-tools/MutationsRenderer.svelte'
    import StackPointerView from '#cmp/specific/project/memory/StackPointerView.svelte'
    import { DEFAULT_MEMORY_VALUE, MEMORY_SIZE } from '#lib/Config.ts'
    import { makeColorizedLabels } from '#lib/languages/commonLanguageFeatures.svelte.ts'
    import type { DebugTool } from './debugTools'
    import { memoryCellMenu } from './pointerMenu'
    import { useWorkbench } from './workbenchContext'

    interface Props {
        tool: DebugTool
        /** In a section or a row of the Workbench; a floating window keeps the tools' own look. */
        docked?: boolean
    }

    let { tool, docked = true }: Props = $props()

    const { session, ui } = useWorkbench()
    const emulator = session.emulator
    const language = $derived(session.project.language)
</script>

{#if tool.kind === 'callstack'}
    <CallStack
        {docked}
        stack={emulator.callStack}
        onGoToInstruction={(address) => void session.revealAddress(address)}
        onGoToLabel={(label) => {
            if (!label.file) return
            //a function in a Listing still being generated is found by its address once it is
            if (label.line < 0) void session.revealAddress(label.address)
            else void session.revealSourceLocation(label.file, label.line)
        }}
    />
{:else if tool.kind === 'history'}
    <MutationsViewer
        {docked}
        {language}
        statusRegisterNames={emulator.statusRegisters.map((r) => r.name)}
        onUndo={(index) => session.undoSteps(index)}
        onHighlight={(step) => {
            if (!step.file) return
            if (step.line < 0) void session.revealAddress(BigInt(step.pc))
            else void session.revealSourceLocation(step.file, step.line, 0)
        }}
        steps={emulator.latestSteps}
    />
{:else}
    <StackPointerView
        emulator={session.emulator}
        tab={tool.tab}
        endianess={tool.tab.endianess}
        defaultMemoryValue={DEFAULT_MEMORY_VALUE[language]}
        memorySize={MEMORY_SIZE[language]}
        systemSize={emulator.systemSize}
        sp={emulator.sp}
        onAddressChange={(address, tab) => emulator.setTabMemoryAddress(address, tab.id)}
        callStackAddresses={makeColorizedLabels(emulator.callStack)}
        pokeable={session.pokeable}
        onPoke={(address, bytes) => session.pokeMemory(address, bytes)}
        cellMenu={(cell) => memoryCellMenu(session, ui, cell)}
        controlsVar={docked ? 'secondary' : 'primary'}
    />
{/if}
