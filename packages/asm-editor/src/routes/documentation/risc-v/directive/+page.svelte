<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/riscv/riscv.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'directives')!
</script>

<ChapterView
    {chapter}
    heading="RISC-V directives"
    title="RISC-V Directives"
    description="RISC-V directives are used by the assembler to execute operations at assembly time. Learn how to use them and the available directives."
/>
