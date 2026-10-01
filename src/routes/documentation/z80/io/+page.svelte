<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import ChapterView from '$cmp/documentation/ChapterView.svelte'
    import { chapters } from '$lib/documentation/z80/z80'

    const chapter = chapters().find((chapter) => chapter.id === 'input-output')!
</script>

<svelte:head>
    <title>Z80 Input/Output</title>
    <meta
        name="description"
        content="The Z80 has no syscalls: programs print and read through the in and out instructions. Learn the console ports of the emulator, with runnable examples."
    />
    <meta
        property="og:description"
        content="The Z80 has no syscalls: programs print and read through the in and out instructions. Learn the console ports of the emulator, with runnable examples."
    />
</svelte:head>
<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>Z80 Input/Output</h1>
    <ChapterView {chapter} />
</Page>
