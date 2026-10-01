<script lang="ts">
    /** The coding agent beside the Project, as the AI assistant panel. */
    import DefaultCodingAgent from '$cmp/shared/agent/DefaultCodingAgent.svelte'
    import {
        PROJECT_AGENT_WORKFLOWS,
        projectAgentInstructions
    } from '$cmp/shared/agent/projectAgent'
    import { useWorkbench } from './workbenchContext'

    const context = useWorkbench()
    const { session } = context
    const project = session.project

    /** The Project's language, and the Lectures unless the host is an Exam (`searchLectures`). */
    const searchPlace = $derived(
        context.searchScope.kind === 'language'
            ? { language: context.searchScope.language, lectures: context.searchScope.lectures }
            : { language: null, lectures: true }
    )
</script>

<div class="agent-panel">
    <DefaultCodingAgent
        editorLanguage={project.language}
        bind:editorCode={project.code}
        bind:files={project.files}
        bind:entry={project.entry}
        activePath={session.displayedPath}
        fileSystem={project.fileSystem}
        emulatorInstance={session.emulator}
        canUpdateLanguage={false}
        additionalInstructions={projectAgentInstructions(project.language)}
        workflows={PROJECT_AGENT_WORKFLOWS}
        {searchPlace}
        style="border-radius: 0; border: none; box-shadow: none; background: transparent; flex: 1; min-height: 0;"
    />
</div>

<style>
    .agent-panel {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
    }
</style>
