<script lang="ts">
    /**
     * The Workbench's execution controls with only the session in their context, as a pane's
     * dock or a tablet's shared bar draws them: the rest of the Workbench is not needed to see
     * which buttons they hold.
     */
    import type { ComponentProps } from 'svelte'
    import type { WorkbenchSession } from '#lib/workbench/WorkbenchSession.svelte.ts'
    import ExecutionControls from '../ExecutionControls.svelte'
    import { setWorkbenchContext, type WorkbenchContext } from '../workbenchContext'

    let {
        session,
        ...props
    }: { session: WorkbenchSession } & ComponentProps<typeof ExecutionControls> = $props()
    // svelte-ignore state_referenced_locally
    setWorkbenchContext({ session } as WorkbenchContext)
</script>

<ExecutionControls {...props} />
