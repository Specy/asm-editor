<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/riscv/riscv.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'interrupts')!
</script>

<ChapterView
    {chapter}
    heading="RISC-V interrupts and the timer"
    title="RISC-V interrupts and the timer: utvec, timecmp and wfi | Asm Editor"
    description="Handle RISC-V user interrupts with utvec and uret: the time and timecmp timer, wfi, keyboard interrupts, and stepping through a handler."
/>
