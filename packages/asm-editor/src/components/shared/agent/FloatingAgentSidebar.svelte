<script lang="ts">
    import DefaultCodingAgent from './DefaultCodingAgent.svelte'
    import AgentSidebarFrame from './AgentSidebarFrame.svelte'
    import type { SupportedLanguage, AgentWorkflow } from './DefaultCodingAgent.svelte'
    import type { Emulator } from '#lib/languages/Emulator.ts'
    import type { AgentSearchPlace } from '#lib/search/scope.ts'

    interface Props {
        open: boolean
        openSize?: string
        verticalOffset?: string
        editorLanguage: SupportedLanguage | null
        editorCode?: string
        emulatorInstance: Emulator | null
        canUpdateLanguage?: boolean
        additionalInstructions?: string
        workflows?: AgentWorkflow[]
        searchPlace?: AgentSearchPlace
    }

    let {
        open = $bindable(),
        openSize,
        verticalOffset = '0px',
        editorLanguage = $bindable(),
        editorCode = $bindable(''),
        emulatorInstance,
        canUpdateLanguage,
        additionalInstructions,
        workflows,
        searchPlace
    }: Props = $props()
</script>

<AgentSidebarFrame bind:open {openSize} {verticalOffset}>
    <DefaultCodingAgent
        bind:editorLanguage
        bind:editorCode
        {emulatorInstance}
        {canUpdateLanguage}
        {additionalInstructions}
        {workflows}
        {searchPlace}
        style="border-radius: 0; border: none; box-shadow: none; opacity: 0.82;"
    />
</AgentSidebarFrame>
