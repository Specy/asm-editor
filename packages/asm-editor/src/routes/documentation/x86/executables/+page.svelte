<script lang="ts">
    import Page from '#cmp/shared/layout/Page.svelte'
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/x86/x86.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'executables')!
</script>

<svelte:head>
    <title>x86-64 Executables</title>
    <meta
        name="description"
        content="Run and debug a compiled x86-64 Linux program: what runs, the bundled libraries, the Hex editor and Byte edits, the Listing and its names, Breakpoints, Arguments, Testcases, patching an instruction and the Build output."
    />
    <meta
        property="og:description"
        content="Run and debug a compiled x86-64 Linux program: what runs, the bundled libraries, the Hex editor and Byte edits, the Listing and its names, Breakpoints, Arguments, Testcases, patching an instruction and the Build output."
    />
</svelte:head>

<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>x86-64 Executables</h1>
    <ChapterView {chapter} />
</Page>
