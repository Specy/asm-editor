<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/mips/mips.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'interrupts')!
</script>

<ChapterView
    {chapter}
    heading="MIPS interrupts and the timer"
    title="MIPS interrupts and the timer: Count, Compare and handlers | Asm Editor"
    description="Handle MIPS interrupts in .ktext at 0x80000180: the Count and Compare timer, keyboard interrupts, eret, and stepping through a handler."
/>
