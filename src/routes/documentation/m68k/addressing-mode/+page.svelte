<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import ChapterView from '$cmp/documentation/ChapterView.svelte'
    import { chapters } from '$lib/documentation/m68k/m68k'

    const chapter = chapters().find((chapter) => chapter.id === 'addressing-modes')!
</script>

<svelte:head>
    <title>M68K Addressing Modes</title>
    <meta
        name="description"
        content="M68K addressing modes are used to access data in different ways. Learn how to use them and the available addressing modes."
    />
    <meta
        property="og:description"
        content="M68K addressing modes are used to access data in different ways. Learn how to use them and the available addressing modes."
    />
</svelte:head>

<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>Addressing modes</h1>
    <ChapterView {chapter} />
</Page>
