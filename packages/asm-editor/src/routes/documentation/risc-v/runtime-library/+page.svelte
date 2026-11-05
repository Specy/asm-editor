<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/riscv/riscv.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'runtime-library')!
</script>

<ChapterView
    {chapter}
    heading="RISC-V Runtime library"
    title="RISC-V Runtime library - ASM Editor"
    description="The C standard library that compiled RISC-V programs use, and how hand-written assembly calls printf, scanf, malloc and the other functions."
/>
