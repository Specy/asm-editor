<script lang="ts">
    import Card from '$cmp/shared/layout/Card.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import { riscvDirectivesMap } from '$lib/languages/RISC-V/RISC-V-documentation'
</script>

<Column gap="1rem" style="width: 100%;">
    {#each Object.values(riscvDirectivesMap) as directive}
        <Card gap="1rem" padding="1rem" background="secondary" style="width: 100%;">
            <h2>.{directive.name}</h2>
            <MarkdownRenderer source={directive.description} />
        </Card>
    {/each}
</Column>
