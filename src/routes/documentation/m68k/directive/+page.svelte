<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import ChapterView from '$cmp/documentation/ChapterView.svelte'
    import { chapters } from '$lib/documentation/m68k/m68k'

    const chapter = chapters().find((chapter) => chapter.id === 'directives')!
</script>

<svelte:head>
    <title>M68K Directives</title>
    <meta
        name="description"
        content="M68K directives are used by the assembler to execute operations at assembly time. Learn how to use them and the available directives."
    />
    <meta
        property="og:description"
        content="M68K directives are used by the assembler to execute operations at assembly time. Learn how to use them and the available directives."
    />
</svelte:head>

<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>Directives</h1>
    <ChapterView {chapter} />
</Page>
