<script lang="ts">
    import InteractiveEditor from '$cmp/shared/InteractiveInstructionEditor.svelte'
    import { type AvailableLanguages } from '$lib/Project.svelte'
    interface Props {
        code?: string
        instructionKey: string
        language: AvailableLanguages
    }

    let { code = $bindable(''), instructionKey, language }: Props = $props()
</script>

{#key instructionKey}
    <InteractiveEditor bind:code {language} />
{/key}
