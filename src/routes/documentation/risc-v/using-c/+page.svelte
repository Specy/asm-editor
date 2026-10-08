<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import ChapterView from '$cmp/documentation/ChapterView.svelte'
    import { chapters } from '$lib/documentation/riscv/riscv'

    const chapter = chapters().find((chapter) => chapter.id === 'using-c')!
</script>

<svelte:head>
    <title>RISC-V Using C and C++</title>
    <meta
        name="description"
        content="Write, run and debug C or C++ for RV32 or RV64, with examples, supported libraries and simulator functions."
    />
    <meta
        property="og:description"
        content="Write, run and debug C or C++ for RV32 or RV64, with examples, supported libraries and simulator functions."
    />
</svelte:head>

<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>RISC-V Using C and C++</h1>
    <ChapterView {chapter} />
</Page>
