<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/mips/mips.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'interrupts')!
</script>

<ChapterView
    {chapter}
    heading="MIPS interrupts and the timer"
    title="MIPS interrupts and the timer: Count, Compare and handlers - ASM Editor"
    description="Set up timer and keyboard interrupts in MIPS, write a handler and step through it in the debugger."
/>
