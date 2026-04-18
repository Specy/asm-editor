<script lang="ts">
    import Card from '$cmp/shared/layout/Card.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import { mipsRegisters } from '$lib/languages/MIPS/MIPS-documentation'
</script>

<Column gap="1rem" style="width: 100%;">
    {#each Object.values(mipsRegisters) as register}
        <Card gap="1rem" padding="1rem" background="secondary" style="width: 100%;">
            <h2>{register.name} ({register.number})</h2>
            <MarkdownRenderer source={register.description} />
        </Card>
    {/each}
</Column>
