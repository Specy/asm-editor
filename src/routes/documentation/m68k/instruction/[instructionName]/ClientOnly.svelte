<script lang="ts">
    import InteractiveEditor from '$cmp/shared/InteractiveInstructionEditor.svelte'
    import { type AvailableLanguages } from '$lib/Project.svelte'
    import Header from '$cmp/shared/layout/Header.svelte'
    import EmulatorLoader from '$cmp/shared/providers/EmulatorLoader.svelte'
    import FaExternalLink from '~icons/fa-solid/external-link-alt'
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
            name: `${instructionKey.toUpperCase()} — ${language} example`,
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
            />
            <button class="try-in-editor" onclick={openInEditor}>
                <div style="width: 1.1em; height: 1.1em;">
                    <FaExternalLink />
                </div>
                Try in the editor
            </button>
        {/snippet}
        {#snippet loading()}
            <Header>Loading emulator...</Header>
        {/snippet}
    </EmulatorLoader>
{/key}

<style>
    /* Anchored where the agent toggle used to sit, so the editor below is unobstructed. */
    .try-in-editor {
        position: fixed;
        top: 3.8rem;
        right: 0.5rem;
        padding: 0.65rem 1rem;
        z-index: 101;
        font-family: Rubik, sans-serif;
        border-radius: 1.5rem;
        border-bottom-right-radius: 0.4rem;
        font-weight: bold;
        border: none;
        gap: 0.5rem;
        background: var(--accent);
        color: var(--accent-text);
        cursor: pointer;
        display: flex;
        font-size: 1rem;
        align-items: center;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        transition: all 0.3s ease;
    }

    .try-in-editor:hover,
    .try-in-editor:focus-visible {
        background-color: color-mix(in srgb, var(--accent) 80%, var(--background));
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    }
</style>
