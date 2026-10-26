<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/m68k/m68k.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'condition-codes')!
</script>

<ChapterView
    {chapter}
    heading="Condition Codes"
    title="M68K Condition Codes"
    description="M68K condition codes are used to determine the result of an operation and control the flow of the program."
/>
