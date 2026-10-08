<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import ChapterView from '$cmp/documentation/ChapterView.svelte'
    import { chapters } from '$lib/documentation/mips/mips'

    const chapter = chapters().find((chapter) => chapter.id === 'screen')!
</script>

<svelte:head>
    <title>MIPS Screen and Memory-Mapped I/O</title>
    <meta
        name="description"
        content="MIPS programs draw through memory: the bitmap display maps one word to one pixel, and four words at 0xffff0000 carry the keyboard and console. Learn how the simulator's display, input devices, and program clock work."
    />
    <meta
        property="og:description"
        content="MIPS programs draw through memory: the bitmap display maps one word to one pixel, and four words at 0xffff0000 carry the keyboard and console. Learn how the simulator's display, input devices, and program clock work."
    />
</svelte:head>
<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>MIPS Screen and Memory-Mapped I/O</h1>
    <ChapterView {chapter} />
</Page>
