<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/mips/mips.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'using-c')!
</script>

<ChapterView
    {chapter}
    heading="MIPS Using C and C++"
    title="MIPS Using C and C++"
    description="Write, run and debug C or C++ for MIPS, with examples, supported libraries and simulator functions."
/>
