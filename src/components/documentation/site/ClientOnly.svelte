<script lang="ts">
    import InteractiveEditor from '$cmp/shared/InteractiveInstructionEditor.svelte'
    import { type AvailableLanguages } from '$lib/Project.svelte'
    import InstructionPreview from './InstructionPreview.svelte'
    import EmulatorLoader from '$cmp/shared/providers/EmulatorLoader.svelte'
    import FaExternalLink from '~icons/fa-solid/external-link-alt'
    import { createSharePayload } from '$lib/utils'
    import { makeProject } from '$lib/Project.svelte'
    import { goto } from '$app/navigation'
    import { resolve } from '$app/paths'
    import type { RegisterFormat } from '$lib/languages/commonLanguageFeatures.svelte'
    import { EXAMPLE_EDITOR_FONT } from '$lib/monaco/exampleFont'
    import './instructionExample.css'

    interface Props {
        code?: string
        instructionKey: string
        language: AvailableLanguages
        showPc?: boolean
        showFlags?: boolean
        showConsole?: boolean
        showMemory?: boolean
        initialRegisterFile?: string
        initialRegisterFormat?: RegisterFormat
    }

    let {
        code = $bindable(''),
        instructionKey,
        language,
        showFlags,
        showPc,
        showConsole,
        showMemory,
        initialRegisterFile,
        initialRegisterFormat
    }: Props = $props()
    /**
     * Hands whatever is currently in the embedded editor to the real one.
     *
     * A share link rather than a saved project: /projects/share loads the payload under
     * SHARE_ID without persisting it, so following this from the docs does not leave a
     * project behind in the reader's list every time they click through. They can still
     * save it from the editor if they want to keep it.
     *
     * Built on click, not derived: it compresses the whole project, and doing that on
     * every keystroke in the editor above would be wasted work.
     */
    function openInEditor() {
        const project = makeProject({
            name: `${instructionKey.toUpperCase()} - ${language} example`,
            description: `Example for the ${language} ${instructionKey} instruction`,
            language,
            code
        })
        const target = resolve('/projects/[project]', { project: 'share' })
        // The route IS resolved, on the line above.
        goto(`${target}?project=${createSharePayload(project)}`)
    }
</script>

<div class="instruction-example playground">
    {#key `${language}/${instructionKey}`}
        <EmulatorLoader
            bind:code
            {language}
            settings={{
                globalPageElementsPerRow: 4,
                globalPageSize: 4 * 8
            }}
        >
            {#snippet children(emulator)}
                <InteractiveEditor
                    bind:code
                    {language}
                    {emulator}
                    {showFlags}
                    {showPc}
                    {showConsole}
                    {showMemory}
                    {initialRegisterFile}
                    {initialRegisterFormat}
                    fontOptions={EXAMPLE_EDITOR_FONT}
                    showScreen={false}
                    forceMemoryRight
                    dockActions={[
                        {
                            label: 'Try in the editor',
                            title: 'Open this example in the editor',
                            icon: FaExternalLink,
                            onClick: openInEditor
                        }
                    ]}
                />
            {/snippet}
            {#snippet loading()}
                <InstructionPreview {code} {language} />
            {/snippet}
        </EmulatorLoader>
    {/key}
</div>
