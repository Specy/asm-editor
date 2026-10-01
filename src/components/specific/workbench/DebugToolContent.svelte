<script lang="ts">
    /** What one Debug tool shows, wherever it is: a floating window, a section, a compact row. */
    import CallStack from '$cmp/specific/project/user-tools/CallStack.svelte'
    import MutationsViewer from '$cmp/specific/project/user-tools/MutationsRenderer.svelte'
    import StackPointerView from '$cmp/specific/project/memory/StackPointerView.svelte'
    import { DEFAULT_MEMORY_VALUE, MEMORY_SIZE } from '$lib/Config'
    import { makeColorizedLabels } from '$lib/languages/commonLanguageFeatures.svelte'
    import type { DebugTool } from './debugTools'
    import { useWorkbench } from './workbenchContext'

    interface Props {
        tool: DebugTool
    }

    let { tool }: Props = $props()

    const { session } = useWorkbench()
    const emulator = session.emulator
    const language = $derived(session.project.language)
</script>

{#if tool.kind === 'callstack'}
    <CallStack
        docked
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
{:else if tool.kind === 'history'}
    <MutationsViewer
        docked
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
{:else}
    <StackPointerView
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
        controlsVar="secondary"
    />
{/if}
