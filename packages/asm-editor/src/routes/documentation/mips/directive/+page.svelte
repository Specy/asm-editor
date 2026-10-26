<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/mips/mips.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'directives')!
</script>

<ChapterView
    {chapter}
    heading="MIPS directives"
    title="MIPS Directives"
    description="MIPS directives are used by the assembler to execute operations at assembly time. Learn how to use them and the available directives."
/>
