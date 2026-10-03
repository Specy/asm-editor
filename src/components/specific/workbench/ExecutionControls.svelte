<script lang="ts">
    /**
     * The Workbench's execution dock: Build, and once built Stop, Run, Undo and Step, with Test at
     * the far end in both. The Workbench has no mode switch, the Build becoming Stop in its place is
     * what says a Debug session is on ([the design record](../../../../docs/design/workbench.md)).
     * The Testcases run on the same Emulator, so Test during a Debug session ends it first. Edge to
     * edge in the bottom corners of the editor on a desktop, along its bottom edge on a phone, and
     * stuck under it on a tablet.
     */
    import ExecutionDock from '$cmp/specific/project/ExecutionDock.svelte'
    import { useWorkbench } from './workbenchContext'

    interface Props {
        fill?: boolean
        attached?: boolean
    }

    let { fill = false, attached = false }: Props = $props()

    const { session } = useWorkbench()
    const emulator = session.emulator

    function test() {
        if (session.debugSession) session.stop()
        void session.test()
    }
</script>

<ExecutionDock
    {fill}
    {attached}
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
