<script lang="ts">
    import InteractiveEditor from '$cmp/shared/InteractiveInstructionEditor.svelte'
    import { type AvailableLanguages } from '$lib/Project.svelte'
    import Header from '$cmp/shared/layout/Header.svelte'
    import EmulatorLoader from '$cmp/shared/providers/EmulatorLoader.svelte'
    import FaExternalLink from '~icons/fa-solid/external-link-alt'
    import Button from '$cmp/shared/button/Button.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import { createSharePayload } from '$lib/utils'
    import { makeProject } from '$lib/Project.svelte'
    import { goto } from '$app/navigation'
    import { resolve } from '$app/paths'

    interface Props {
        code?: string
        instructionKey: string
        language: AvailableLanguages
        showPc?: boolean
        showFlags?: boolean
        showConsole?: boolean
    }

    let {
        code = $bindable(''),
        instructionKey,
        language,
        showFlags,
        showPc,
        showConsole
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

{#key instructionKey}
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
                showScreen={false}
                forceMemoryRight
            >
                <!-- The playground's own control row, next to Build and Run, rather than floating
                     over the page: the reader reaches for it from the same place as the rest. -->
                {#snippet controls()}
                    <Button
                        cssVar="secondary"
                        style="gap: 0.5rem; margin-left: auto"
                        onClick={openInEditor}
                    >
                        <Icon>
                            <FaExternalLink />
                        </Icon>
                        Try in the editor
                    </Button>
                {/snippet}
            </InteractiveEditor>
        {/snippet}
        {#snippet loading()}
            <Header>Loading emulator...</Header>
        {/snippet}
    </EmulatorLoader>
{/key}
