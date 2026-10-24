<script lang="ts">
    import { languageLabel } from '#lib/languages/languageLabel.ts'
    import InteractiveEditor from '#cmp/shared/InteractiveInstructionEditor.svelte'
    import { type AvailableLanguages } from '#lib/Project.svelte.ts'
    import InstructionPreview from './InstructionPreview.svelte'
    import EmulatorLoader from '#cmp/shared/providers/EmulatorLoader.svelte'
    import FaExternalLink from '~icons/fa-solid/external-link-alt'
    import { createSharePayload } from '#lib/utils.ts'
    import { makeProject } from '#lib/Project.svelte.ts'
    import { goto } from '$app/navigation'
    import { resolve } from '$app/paths'
    import type { RegisterFormat } from '#lib/languages/commonLanguageFeatures.svelte.ts'
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
            name: `${instructionKey.toUpperCase()} - ${languageLabel(language)} example`,
            description: `Example for the ${languageLabel(language)} ${instructionKey} instruction`,
            language,
            code
        })
        goto(resolve(`projects/share?project=${createSharePayload(project)}`))
    }
</script>

<!-- the registers wait for a Build, and the flags and the PC above them make that column about 2rem
     taller than the row's usual 20rem: the code gets the same height from the start, so the console
     under it stays where it is when they come -->
<div
    class="instruction-example playground"
    style:--instruction-row-min-height={showPc && showFlags ? '22rem' : undefined}
>
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
                    showScreen={false}
                    hideUntilBuilt
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
                <InstructionPreview {code} {language} {showConsole} />
            {/snippet}
        </EmulatorLoader>
    {/key}
</div>
