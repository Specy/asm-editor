<script lang="ts">
    /**
     * The Workbench's execution dock: Build, and once built Stop, Run, Undo and Step, with Test at
     * the far end in both. The Workbench has no mode switch, the Build becoming Stop in its place is
     * what says a Debug session is on ([the design record](../../../../docs/design/workbench.md)).
     * The Testcases run on the same Emulator, so Test during a Debug session ends it first. Edge to
     * edge in the bottom corners of the editor on a desktop, along its bottom edge on a phone, and
     * stuck under it on a tablet.
     */
    import ExecutionDock, { type DockCompilation } from '$cmp/specific/project/ExecutionDock.svelte'
    import {
        isCompilationTarget,
        OPTIMIZATIONS,
        sourceLanguage,
        type Optimization
    } from '$lib/sourceCompilation/records'
    import { useWorkbench } from './workbenchContext'
    import type { EditorGroup } from '$lib/workbench/EditorGroup.svelte'

    interface Props {
        fill?: boolean
        attached?: boolean
        group?: EditorGroup
        execution?: boolean
        showCompilation?: boolean
    }

    let {
        fill = false,
        attached = false,
        group,
        execution = true,
        showCompilation = true
    }: Props = $props()

    const { session } = useWorkbench()
    const emulator = session.emulator
    const pane = $derived(group ?? session.controlsGroup)
    const compilation = $derived.by<DockCompilation | undefined>(() => {
        if (!showCompilation) return undefined
        const source = !!sourceLanguage(pane.displayedPath)
        if (!source && !pane.recompilationNeeded) return undefined
        const supported = isCompilationTarget(session.project.language)
        const busy = session.compiling && session.compilingGroupId === pane.id
        return {
            label: busy ? 'Compiling…' : source ? 'Compile' : 'Recompile',
            disabled: pane.sourceCompileDisabled,
            busy,
            warning: supported
                ? undefined
                : `Source compilation is unavailable for ${session.project.language}.`,
            optimization:
                supported && source
                    ? {
                          value: pane.optimization,
                          levels: OPTIMIZATIONS,
                          onChange: (value) => {
                              pane.optimization = value as Optimization
                          }
                      }
                    : undefined,
            onCompile: () => void session.compileDisplayedSource(pane),
            onCancel: () => session.cancelSourceCompilation()
        }
    })

    function test() {
        if (session.debugSession) session.stop()
        void session.test()
    }
</script>

<ExecutionDock
    {fill}
    {attached}
    roundedStart={session.groups.length > 1 && session.groups[0] !== pane}
    {compilation}
    compileOnly={!execution ||
        (!!sourceLanguage(pane.displayedPath) && session.groups.length === 1)}
    showExecution={execution}
    debugging={session.debugSession}
    building={session.building}
    running={session.running}
    buildDisabled={session.buildDisabled}
    executionDisabled={session.executionDisabled}
    undoDisabled={session.undoDisabled}
    canUndo={emulator.canUndo}
    hasTests={session.project.testcases.length > 0}
    onBuild={() => session.build()}
    onStop={() => session.stop()}
    onRun={() => session.run()}
    onPause={() => session.pause()}
    onUndo={() => session.undo()}
    onStep={() => session.step()}
    onTest={test}
/>
