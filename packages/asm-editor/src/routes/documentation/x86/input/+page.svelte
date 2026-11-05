<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/x86/x86.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'input')!
</script>

<ChapterView
    {chapter}
    heading="x86-64 Keys and the Pointer"
    title="x86-64 Keys and the Pointer: /dev/input and the Terminal - ASM Editor"
    description="Read x86 Screen keys, pointer positions and buttons through /dev/input, or read Terminal characters through standard input."
/>
