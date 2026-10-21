<script lang="ts">
    import Page from '#cmp/shared/layout/Page.svelte'
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/x86/x86.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'vector-instructions')!
</script>

<svelte:head>
    <title>x86-64 Vector instructions</title>
    <meta
        name="description"
        content="The ymm registers and the AVX, AVX2, FMA and BMI instructions: which run in the editor, how they treat the upper half of a register, which cross between 128-bit lanes, and how memory operands are sized and aligned."
    />
    <meta
        property="og:description"
        content="The ymm registers and the AVX, AVX2, FMA and BMI instructions: which run in the editor, how they treat the upper half of a register, which cross between 128-bit lanes, and how memory operands are sized and aligned."
    />
</svelte:head>

<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>x86-64 Vector instructions</h1>
    <ChapterView {chapter} />
</Page>
