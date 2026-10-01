<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import ChapterView from '$cmp/documentation/ChapterView.svelte'
    import { chapters } from '$lib/documentation/m68k/m68k'

    const chapter = chapters().find((chapter) => chapter.id === 'trap-tasks')!
</script>

<svelte:head>
    <title>M68K Trap Tasks</title>
    <meta
        name="description"
        content="The M68K has one system call, trap #15. Learn every task the emulator supports: printing and reading, the graphics tasks, the keyboard and the mouse, and program time."
    />
    <meta
        property="og:description"
        content="The M68K has one system call, trap #15. Learn every task the emulator supports: printing and reading, the graphics tasks, the keyboard and the mouse, and program time."
    />
</svelte:head>
<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>M68K Trap Tasks</h1>
    <ChapterView {chapter} />
</Page>
