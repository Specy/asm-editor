<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import ChapterView from '$cmp/documentation/ChapterView.svelte'
    import { chapters } from '$lib/documentation/riscv/riscv'

    const chapter = chapters().find((chapter) => chapter.id === 'registers')!
</script>

<svelte:head>
    <title>RISC-V Registers</title>
    <meta
        name="description"
        content="RISC-V registers reference: the 32 general purpose registers with their ABI names, the floating point registers, and the control and status registers the simulator implements."
    />
    <meta
        property="og:description"
        content="RISC-V registers reference: the 32 general purpose registers with their ABI names, the floating point registers, and the control and status registers the simulator implements."
    />
</svelte:head>
<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>RISC-V Registers</h1>
    <ChapterView {chapter} />
</Page>
