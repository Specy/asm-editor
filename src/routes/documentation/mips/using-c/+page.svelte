<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import ChapterView from '$cmp/documentation/ChapterView.svelte'
    import { chapters } from '$lib/documentation/mips/mips'

    const chapter = chapters().find((chapter) => chapter.id === 'using-c')!
</script>

<svelte:head>
    <title>MIPS Using C and C++</title>
    <meta
        name="description"
        content="Compile C or C++ for MIPS, use the Environment library, and follow generated assembly."
    />
    <meta
        property="og:description"
        content="Compile C or C++ for MIPS, use the Environment library, and follow generated assembly."
    />
</svelte:head>

<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>MIPS Using C and C++</h1>
    <ChapterView {chapter} />
</Page>
