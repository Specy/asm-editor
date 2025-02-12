<script lang="ts">
    import Column from '$cmp/shared/layout/Column.svelte'
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import { mipsDirectivesMap } from '$lib/languages/MIPS-documentation'
    import Page from '$cmp/shared/layout/Page.svelte'
    import Card from '$cmp/shared/layout/Card.svelte'
</script>

<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>MIPS directives</h1>
    <p>
        MIPS directives are used to define the structure of the program. They are not instructions
        that are executed by the CPU, but rather instructions that are used by the assembler to
        define the structure of the program.
    </p>
    <Column gap="1rem">
        {#each Object.values(mipsDirectivesMap) as directive}
            <Card gap="1rem" padding="1rem" background="secondary">
                <h2>.{directive.name}</h2>
                <MarkdownRenderer source={directive.description} />
            </Card>
        {/each}
    </Column>
</Page>
