<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/m68k/m68k.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'addressing-modes')!
</script>

<ChapterView
    {chapter}
    heading="Addressing modes"
    title="M68K Addressing Modes"
    description="M68K addressing modes are used to access data in different ways. Learn how to use them and the available addressing modes."
/>
