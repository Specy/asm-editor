<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/mips/mips.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'registers')!
</script>

<ChapterView
    {chapter}
    heading="MIPS Registers"
    title="MIPS Registers"
    description="MIPS registers reference: the 32 general purpose registers, the floating point registers of coprocessor 1 with their condition flags, and the coprocessor 0 exception registers."
/>
