<script lang="ts">
    /**
     * The **Workbench**: the full-screen editor in which a person writes, builds, debugs and tests a
     * Project, laid out like an IDE ([the design record](../../../../../../docs/design/workbench.md)). It
     * edits exactly one Project and owns nothing around it
     * ([ADR 0024](../../../../../../docs/adr/0024-workbench-is-a-host-agnostic-shell.md)): its host passes
     * the actions it supports, which built-in panels are off or read only, and panels and links of
     * its own. It fills its container, never the viewport, and it creates the Project's Emulator.
     */
    import { defaultEntryPath } from '#lib/Project.svelte.ts'
    import type { BuildSources } from '#lib/projectFiles.ts'
    import { NO_PROGRAM_MESSAGE } from '#lib/workbench/WorkbenchSession.svelte.ts'
    import EmulatorLoader from '#cmp/shared/providers/EmulatorLoader.svelte'
    import { resolveProjectSettings } from '#lib/projectSettings.ts'
    import type { WorkbenchProps } from '#lib/workbench/hostApi.ts'
    import WorkbenchShell from './WorkbenchShell.svelte'

    let { project, activePanel = $bindable(null), loading, ...shell }: WorkbenchProps = $props()

    //the Emulator starts on the Selected program's Settings, Display and Entry, which the session
    //keeps up to date from then on; with no Program, on the sources the session's `sourceInput`
    //has then, since an Emulator needs an Entry path to be made at all
    const effective = $derived(resolveProjectSettings(project.language, project.selected?.settings))
    const source = $derived<BuildSources>(
        project.selectedProgram === undefined
            ? {
                  files: project.files,
                  entry: defaultEntryPath(project.language),
                  assemblyError: NO_PROGRAM_MESSAGE
              }
            : { files: project.files, entry: project.selectedProgram }
    )
</script>

<div class="workbench-host">
    {#key project.language}
        <EmulatorLoader
            code={project.code}
            {source}
            language={project.language}
            {loading}
            settings={{
                automaticChecking: false,
                display: project.selected?.display,
                screenHistoryBudgetMb: effective.screenHistoryBudgetMb,
                fileSystemHistoryBudgetMb: effective.fileSystemHistoryBudgetMb,
                programArguments: effective.programArguments,
                peripherals: { fileSystem: project.fileSystem }
            }}
        >
            {#snippet children(emulator)}
                <WorkbenchShell {project} {emulator} bind:activePanel {...shell} />
            {/snippet}
        </EmulatorLoader>
    {/key}
</div>

<style>
    .workbench-host {
        display: flex;
        flex-direction: column;
        flex: 1;
        width: 100%;
        height: 100%;
        min-height: 0;
        min-width: 0;
        position: relative;
    }
</style>
