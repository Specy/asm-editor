<script lang="ts">
    /**
     * The **Workbench**: the full-screen editor in which a person writes, builds, debugs and tests a
     * Project, laid out like an IDE ([the design record](../../../../../../docs/design/workbench.md)). It
     * edits exactly one Project and owns nothing around it
     * ([ADR 0024](../../../../../../docs/adr/0024-workbench-is-a-host-agnostic-shell.md)): its host passes
     * the actions it supports, which built-in panels are off or read only, and panels and links of
     * its own. It fills its container, never the viewport, and it creates the Project's Emulator.
     */
    import type { Snippet } from 'svelte'
    import { defaultEntryPath, type Project } from '#lib/Project.svelte.ts'
    import type { BuildSources } from '#lib/projectFiles.ts'
    import type { EditJournalStore } from '#lib/editJournal.ts'
    import type { WorkbenchUi } from '#lib/workbench/WorkbenchUi.svelte.ts'
    import { NO_PROGRAM_MESSAGE } from '#lib/workbench/WorkbenchSession.svelte.ts'
    import EmulatorLoader from '#cmp/shared/providers/EmulatorLoader.svelte'
    import { resolveProjectSettings } from '#lib/projectSettings.ts'
    import type {
        BuiltinPanelId,
        PanelAccess,
        WorkbenchHostLink,
        WorkbenchHostPanel
    } from '#lib/workbench/hostApi.ts'
    import WorkbenchShell from './WorkbenchShell.svelte'

    interface Props {
        /** The Project being edited, its FileSystem included. */
        project: Project
        readonly?: boolean
        onBack?: () => void
        /** Saves the Project; autosave calls it with `silent: true`. */
        onSave?: (options: { silent: boolean }) => void
        onShare?: () => void
        /** Every change to the Project, for a host that tracks unsaved changes itself. */
        onChange?: () => void
        /** Whether the Project has changes nothing will save on its own; shows Save. */
        unsaved?: boolean
        /** Where the Edit journal is kept between visits; without one it lasts as long as the page. */
        editJournals?: EditJournalStore
        access?: Partial<Record<BuiltinPanelId, PanelAccess>>
        /** Whether the documentation's links may navigate; the exam turns them off. */
        documentationLinks?: boolean
        /**
         * Whether a documentation search looks through the Lectures too. An Exam searches the
         * Documentation alone, so no Example hands a student a finished program (the **Search
         * scope**); the AI assistant's search follows it.
         */
        searchLectures?: boolean
        hostPanels?: WorkbenchHostPanel[]
        hostLinks?: WorkbenchHostLink[]
        /** The panel open beside the rail, by id; bindable so the host's chrome can open one. */
        activePanel?: string | null
        /** Host actions above the workspace, with access to its responsive menu state. */
        header?: Snippet<[WorkbenchUi]>
        loading?: Snippet
    }

    let { project, activePanel = $bindable(null), loading, ...shell }: Props = $props()

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
