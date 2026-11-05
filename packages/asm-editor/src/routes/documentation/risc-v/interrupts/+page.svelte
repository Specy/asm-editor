<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/riscv/riscv.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'interrupts')!
</script>

<ChapterView
    {chapter}
    heading="RISC-V interrupts and the timer"
    title="RISC-V interrupts and the timer: utvec, timecmp and wfi - ASM Editor"
    description="Set up timer and keyboard interrupts in RISC-V, write a handler and step through it in the debugger."
/>
