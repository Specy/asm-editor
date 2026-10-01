<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import ChapterView from '$cmp/documentation/ChapterView.svelte'
    import { chapters } from '$lib/documentation/x86/x86'

    const chapter = chapters().find((chapter) => chapter.id === 'registers-and-flags')!
</script>

<svelte:head>
    <title>x86-64 Registers & Flags</title>
    <meta
        name="description"
        content="The x86-64 registers, the four widths each one can be used at, the flags arithmetic writes, the condition codes the conditional instructions read, and the SSE and x87 floating point registers."
    />
    <meta
        property="og:description"
        content="The x86-64 registers, the four widths each one can be used at, the flags arithmetic writes, the condition codes the conditional instructions read, and the SSE and x87 floating point registers."
    />
</svelte:head>
<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>x86-64 registers & flags</h1>
    <ChapterView {chapter} />
</Page>
