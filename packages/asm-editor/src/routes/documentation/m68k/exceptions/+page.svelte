<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/m68k/m68k.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'exceptions')!
</script>

<ChapterView
    {chapter}
    heading="Exceptions and the vector table"
    title="M68K Exceptions and the Vector Table"
    description="How a real 68000 handles exceptions, interrupts and traps: the 256 entry vector table, the five steps the CPU takes, and what this editor does instead, since none of it is implemented here."
/>
