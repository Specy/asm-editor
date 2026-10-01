<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import ChapterView from '$cmp/documentation/ChapterView.svelte'
    import { chapters } from '$lib/documentation/z80/z80'

    const chapter = chapters().find((chapter) => chapter.id === 'registers-and-flags')!
</script>

<svelte:head>
    <title>Z80 Registers & Flags</title>
    <meta
        name="description"
        content="The Z80 registers and flags: the accumulator, the general purpose pairs, the index registers, the alternate set, and the six flags of the F register."
    />
    <meta
        property="og:description"
        content="The Z80 registers and flags: the accumulator, the general purpose pairs, the index registers, the alternate set, and the six flags of the F register."
    />
</svelte:head>
<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>Z80 Registers & Flags</h1>
    <ChapterView {chapter} />
</Page>
