<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import ChapterView from '$cmp/documentation/ChapterView.svelte'
    import { chapters } from '$lib/documentation/mips/mips'

    const chapter = chapters().find((chapter) => chapter.id === 'registers')!
</script>

<svelte:head>
    <title>MIPS Registers</title>
    <meta
        name="description"
        content="MIPS registers reference: the 32 general purpose registers, the floating point registers of coprocessor 1 with their condition flags, and the coprocessor 0 exception registers."
    />
    <meta
        property="og:description"
        content="MIPS registers reference: the 32 general purpose registers, the floating point registers of coprocessor 1 with their condition flags, and the coprocessor 0 exception registers."
    />
</svelte:head>
<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>MIPS Registers</h1>
    <ChapterView {chapter} />
</Page>
