<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import ChapterView from '$cmp/documentation/ChapterView.svelte'
    import { chapters } from '$lib/documentation/z80/z80'

    const chapter = chapters().find((chapter) => chapter.id === 'directives')!
</script>

<svelte:head>
    <title>Z80 Directives</title>
    <meta
        name="description"
        content="Z80 assembler directives place code in memory, define data and constants, include files and expand macros. Learn how to use them and the available directives."
    />
    <meta
        property="og:description"
        content="Z80 assembler directives place code in memory, define data and constants, include files and expand macros. Learn how to use them and the available directives."
    />
</svelte:head>
<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>Z80 directives</h1>
    <ChapterView {chapter} />
</Page>
