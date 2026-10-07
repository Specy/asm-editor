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
        content="Compile freestanding C or C++ for x86, use the Environment library, and follow generated NASM assembly."
    />
    <meta
        property="og:description"
        content="Compile freestanding C or C++ for x86, use the Environment library, and follow generated NASM assembly."
    />
</svelte:head>

<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>x86 Using C and C++</h1>
    <ChapterView {chapter} />
</Page>
