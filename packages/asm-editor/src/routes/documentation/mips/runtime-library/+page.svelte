<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/mips/mips.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'runtime-library')!
</script>

<ChapterView
    {chapter}
    heading="MIPS Runtime library"
    title="MIPS Runtime library"
    description="The C standard library that compiled MIPS programs use, and how hand-written assembly calls printf, scanf, malloc and the other functions."
/>
