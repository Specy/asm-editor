<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/x86/x86.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'directives')!
</script>

<ChapterView
    {chapter}
    heading="x86-64 directives"
    title="x86-64 Directives"
    description="NASM directives place code and data in sections, reserve space, define constants and macros, and control the preprocessor. Learn how to use them and which ones the assembler accepts."
/>
