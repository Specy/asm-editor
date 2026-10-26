<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/m68k/m68k.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'shift-directions')!
</script>

<ChapterView
    {chapter}
    heading="Shift Directions"
    title="M68K Shift Directions"
    description="Shift directions in M68K specify the direction in which bits are shifted. Learn about the shift logical, shift arithmetical, and rotate directions."
/>
