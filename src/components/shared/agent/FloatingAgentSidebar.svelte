<script lang="ts">
    import DefaultCodingAgent from './DefaultCodingAgent.svelte'
    import AgentSidebarFrame from './AgentSidebarFrame.svelte'
    import type {
        SupportedLanguage,
        AgentWorkflow,
        AgentToolAllowList,
        AgentWorkflowAllowList
    } from './DefaultCodingAgent.svelte'
    import type { Emulator } from '$lib/languages/Emulator'
    import type { FileSystem } from '$lib/languages/peripherals/FileSystem'
    import type { AgentSearchPlace } from '$lib/search/scope'
    import type { ProjectFiles } from '$lib/projectFiles'
    import type { RegisteredTool } from '@discerns/sdk'

    interface Props {
        open: boolean
        openSize?: string
        verticalOffset?: string
        editorLanguage: SupportedLanguage | null
        editorCode?: string
        files?: ProjectFiles
        entry?: string
        fileSystem?: FileSystem
        activePath?: string
        emulatorInstance: Emulator | null
        canUpdateLanguage?: boolean
        additionalInstructions?: string
        tools?: RegisteredTool[]
        workflows?: AgentWorkflow[]
        allowToolList?: AgentToolAllowList
        allowWorkflowList?: AgentWorkflowAllowList
        searchPlace?: AgentSearchPlace
    }

    let {
        open = $bindable(),
        openSize,
        verticalOffset = '0px',
        editorLanguage = $bindable(),
        editorCode = $bindable(''),
        files = $bindable(undefined),
        entry = $bindable(undefined),
        fileSystem,
        activePath = $bindable(undefined),
        emulatorInstance,
        canUpdateLanguage,
        additionalInstructions,
        tools,
        workflows,
        allowToolList,
        allowWorkflowList,
        searchPlace
    }: Props = $props()
</script>

<AgentSidebarFrame bind:open {openSize} {verticalOffset}>
    <DefaultCodingAgent
        bind:editorLanguage
        bind:editorCode
        bind:files
        bind:entry
        bind:activePath
        {fileSystem}
        {emulatorInstance}
        {canUpdateLanguage}
        {additionalInstructions}
        {tools}
        {workflows}
        {allowToolList}
        {allowWorkflowList}
        {searchPlace}
        style="border-radius: 0; border: none; box-shadow: none; opacity: 0.82;"
    />
</AgentSidebarFrame>
