<script lang="ts">
    /** The coding agent beside the Project, as the AI assistant panel. */
    import DefaultCodingAgent from '$cmp/shared/agent/DefaultCodingAgent.svelte'
    import {
        PROJECT_AGENT_WORKFLOWS,
        projectAgentInstructions
    } from '$cmp/shared/agent/projectAgent'
    import { useWorkbench } from './workbenchContext'

    const { session } = useWorkbench()
    const project = session.project
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
