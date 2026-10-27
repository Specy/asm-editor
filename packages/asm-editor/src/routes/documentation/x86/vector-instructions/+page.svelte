<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/x86/x86.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'vector-instructions')!
</script>

<ChapterView
    {chapter}
    heading="x86-64 Vector instructions"
    title="x86-64 Vector instructions"
    description="The ymm registers and the AVX, AVX2, FMA and BMI instructions: which run in the editor, how they treat the upper half of a register, which cross between 128-bit lanes, and how memory operands are sized and aligned."
/>
