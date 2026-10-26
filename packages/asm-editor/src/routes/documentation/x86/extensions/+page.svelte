<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/x86/x86.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'extensions')!
</script>

<ChapterView
    {chapter}
    heading="x86-64 extensions"
    title="x86-64 Extensions"
    description="Every x86-64 instruction NASM accepts beyond the integer instruction set: the SSE, AVX and AVX-512 vector extensions, the x87 floating point unit and the system instructions, under the headings NASM files them under, each with its one line summary."
/>
