<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import ChapterView from '$cmp/documentation/ChapterView.svelte'
    import { chapters } from '$lib/documentation/riscv/riscv'

    const chapter = chapters().find((chapter) => chapter.id === 'directives')!
</script>

<svelte:head>
    <title>RISC-V Directives</title>
    <meta
        name="description"
        content="RISC-V directives are used by the assembler to execute operations at assembly time. Learn how to use them and the available directives."
    />
    <meta
        property="og:description"
        content="RISC-V directives are used by the assembler to execute operations at assembly time. Learn how to use them and the available directives."
    />
</svelte:head>
<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>RISC-V directives</h1>
    <ChapterView {chapter} />
</Page>
