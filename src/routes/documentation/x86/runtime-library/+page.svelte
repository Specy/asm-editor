<script lang="ts">
    import Page from '#cmp/shared/layout/Page.svelte'
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/x86/x86.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'runtime-library')!
</script>

<svelte:head>
    <title>x86 Runtime library</title>
    <meta
        name="description"
        content="The C standard library that compiled x86 programs use, and how hand-written assembly calls printf, scanf, malloc and the other functions."
    />
    <meta
        property="og:description"
        content="The C standard library that compiled x86 programs use, and how hand-written assembly calls printf, scanf, malloc and the other functions."
    />
</svelte:head>

<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>x86 Runtime library</h1>
    <ChapterView {chapter} />
</Page>
