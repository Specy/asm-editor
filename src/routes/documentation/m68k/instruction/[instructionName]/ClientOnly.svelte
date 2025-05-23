<script lang="ts">
    import InteractiveEditor from '$cmp/shared/InteractiveInstructionEditor.svelte'
    import { type AvailableLanguages } from '$lib/Project.svelte'
    import Header from '$cmp/shared/layout/Header.svelte'
    import EmulatorLoader from '$cmp/shared/providers/EmulatorLoader.svelte'

    interface Props {
        code?: string
        instructionKey: string
        language: AvailableLanguages
    }

    let { code = $bindable(''), instructionKey, language }: Props = $props()
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
            <InteractiveEditor bind:code {language} {emulator} />
        {/snippet}
        {#snippet loading()}
            <Header>Loading emulator...</Header>
        {/snippet}
    </EmulatorLoader>
{/key}
