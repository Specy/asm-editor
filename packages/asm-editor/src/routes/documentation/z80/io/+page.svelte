<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/z80/z80.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'input-output')!
</script>

<ChapterView
    {chapter}
    heading="Z80 Input/Output"
    title="Z80 Input/Output"
    description="The Z80 has no syscalls: programs print and read through the in and out instructions. Learn the console ports of the emulator, with runnable examples."
/>
