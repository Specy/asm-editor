<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/x86/x86.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'executables')!
</script>

<ChapterView
    {chapter}
    heading="x86-64 Executables"
    title="x86-64 Executables"
    description="Run and debug a compiled x86-64 Linux program: what runs, the bundled libraries, editing bytes in the Hex editor, the Listing and its names, Breakpoints, Arguments, Testcases, patching an instruction and the Build output."
/>
