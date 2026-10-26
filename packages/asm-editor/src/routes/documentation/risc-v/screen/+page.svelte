<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/riscv/riscv.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'screen')!
</script>

<ChapterView
    {chapter}
    heading="RISC-V Screen and Memory-Mapped I/O"
    title="RISC-V Screen and Memory-Mapped I/O"
    description="RISC-V programs draw through memory: the bitmap display maps one word to one pixel, and four words at 0xffff0000 carry the keyboard and console. Learn how the simulator's display, input devices, and program clock work."
/>
