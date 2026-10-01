<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import ChapterView from '$cmp/documentation/ChapterView.svelte'
    import { chapters } from '$lib/documentation/m68k/m68k'

    const chapter = chapters().find((chapter) => chapter.id === 'assembler-features')!
</script>

<svelte:head>
    <title>M68K Assembler Features</title>
    <meta
        name="description"
        content="M68K assembler features. Learn how to use these features to enhance your assembly code."
    />
    <meta
        property="og:description"
        content="M68K assembler features. Learn how to use these features to enhance your assembly code."
    />
</svelte:head>

<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>Assembler features</h1>
    <ChapterView {chapter} />
</Page>
