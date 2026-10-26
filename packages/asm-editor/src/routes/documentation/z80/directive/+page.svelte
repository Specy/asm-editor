<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/z80/z80.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'directives')!
</script>

<ChapterView
    {chapter}
    heading="Z80 directives"
    title="Z80 Directives"
    description="Z80 assembler directives place code in memory, define data and constants, include files and expand macros. Learn how to use them and the available directives."
/>
