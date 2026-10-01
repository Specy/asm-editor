<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import ChapterView from '$cmp/documentation/ChapterView.svelte'
    import { chapters } from '$lib/documentation/x86/x86'

    const chapter = chapters().find((chapter) => chapter.id === 'directives')!
</script>

<svelte:head>
    <title>x86-64 Directives</title>
    <meta
        name="description"
        content="NASM directives place code and data in sections, reserve space, define constants and macros, and control the preprocessor. Learn how to use them and which ones the assembler accepts."
    />
    <meta
        property="og:description"
        content="NASM directives place code and data in sections, reserve space, define constants and macros, and control the preprocessor. Learn how to use them and which ones the assembler accepts."
    />
</svelte:head>
<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>x86-64 directives</h1>
    <ChapterView {chapter} />
</Page>
