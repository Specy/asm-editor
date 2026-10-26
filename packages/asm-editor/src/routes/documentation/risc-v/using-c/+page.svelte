<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/riscv/riscv.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'using-c')!
</script>

<ChapterView
    {chapter}
    heading="RISC-V Using C and C++"
    title="RISC-V Using C and C++"
    description="Write, run and debug C or C++ for RV32 or RV64, with examples, supported libraries and simulator functions."
/>
