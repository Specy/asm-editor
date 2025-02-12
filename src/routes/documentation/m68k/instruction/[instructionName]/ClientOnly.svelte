<script lang="ts">
    import InteractiveEditor from '$cmp/shared/InteractiveInstructionEditor.svelte'
    interface Props {
        code?: string
        instructionKey: string
    }

    let { code = $bindable(''), instructionKey }: Props = $props()
</script>

{#key instructionKey}
    <InteractiveEditor bind:code language="M68K" />
{/key}
