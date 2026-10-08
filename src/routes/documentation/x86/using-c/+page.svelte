<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import ChapterView from '$cmp/documentation/ChapterView.svelte'
    import { chapters } from '$lib/documentation/x86/x86'

    const chapter = chapters().find((chapter) => chapter.id === 'using-c')!
</script>

<svelte:head>
    <title>x86 Using C and C++</title>
    <meta
        name="description"
        content="Write, run and debug C or C++ for x86, with examples, simulator functions and supported language features."
    />
    <meta
        property="og:description"
        content="Write, run and debug C or C++ for x86, with examples, simulator functions and supported language features."
    />
</svelte:head>

<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>x86 Using C and C++</h1>
    <ChapterView {chapter} />
</Page>
