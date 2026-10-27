<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/x86/x86.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'registers-and-flags')!
</script>

<ChapterView
    {chapter}
    heading="x86-64 registers & flags"
    title="x86-64 Registers & Flags"
    description="The x86-64 registers, the four widths each one can be used at, the flags arithmetic writes, the condition codes the conditional instructions read, and the SSE and x87 floating point registers."
/>
