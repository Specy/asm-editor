<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/x86/x86.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'runtime-library')!
</script>

<ChapterView
    {chapter}
    heading="x86-64 Runtime library"
    title="x86-64 Runtime library"
    description="The C standard library that compiled x86-64 programs use, and how hand-written assembly calls printf, scanf, malloc and the other functions."
/>
