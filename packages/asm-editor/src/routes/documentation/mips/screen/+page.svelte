<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/mips/mips.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'screen')!
</script>

<ChapterView
    {chapter}
    heading="MIPS Screen and Memory-Mapped I/O"
    title="MIPS Screen and Memory-Mapped I/O"
    description="MIPS programs draw through memory: the bitmap display maps one word to one pixel, and four words at 0xffff0000 carry the keyboard and console. Learn how the simulator's display, input devices, and program clock work."
/>
