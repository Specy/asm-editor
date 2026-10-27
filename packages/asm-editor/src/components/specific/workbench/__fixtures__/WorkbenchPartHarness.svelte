<script lang="ts">
    /**
     * A part of the Workbench that reads nothing from its context but the session, the UI state
     * and the rail, drawn without the rest of the Workbench: the bottom panel's Program picker, the
     * side panel, the desktop's debug column, or the first pane's empty editor.
     */
    import type { WorkbenchSession } from '#lib/workbench/WorkbenchSession.svelte.ts'
    import type { WorkbenchUi } from '#lib/workbench/WorkbenchUi.svelte.ts'
    import DebugColumn from '../DebugColumn.svelte'
    import EmptyEditor from '../EmptyEditor.svelte'
    import ProgramPicker from '../ProgramPicker.svelte'
    import SidePanel from '../SidePanel.svelte'
    import { setWorkbenchContext, type RailEntry, type WorkbenchContext } from '../workbenchContext'

    let {
        session,
        ui,
        rail = [],
        part
    }: {
        session: WorkbenchSession
        ui: WorkbenchUi
        rail?: RailEntry[]
        part: 'program-picker' | 'side-panel' | 'debug-column' | 'empty-editor'
    } = $props()
    // svelte-ignore state_referenced_locally
    setWorkbenchContext({ session, ui, rail, documentationLinks: false } as WorkbenchContext)
</script>

{#if part === 'program-picker'}
    <ProgramPicker />
{:else if part === 'debug-column'}
    <DebugColumn />
{:else if part === 'empty-editor'}
    <EmptyEditor group={session.groups[0]} />
{:else}
    <SidePanel />
{/if}
