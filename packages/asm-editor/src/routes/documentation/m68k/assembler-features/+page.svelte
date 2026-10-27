<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/m68k/m68k.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'assembler-features')!
</script>

<ChapterView
    {chapter}
    heading="Assembler features"
    title="M68K Assembler Features"
    description="M68K assembler features. Learn how to use these features to enhance your assembly code."
/>
