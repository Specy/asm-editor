<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/x86/x86.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'using-c')!
</script>

<ChapterView
    {chapter}
    heading="x86-64 Using C and C++"
    title="x86-64 Using C and C++"
    description="Write, run and debug C or C++ for x86-64, with examples, simulator functions and supported language features."
/>
