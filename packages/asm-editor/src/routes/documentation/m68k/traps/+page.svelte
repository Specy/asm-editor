<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/m68k/m68k.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'trap-tasks')!
</script>

<ChapterView
    {chapter}
    heading="M68K Trap Tasks"
    title="M68K trap #15 task reference (EASy68K) | Asm Editor"
    description="The M68K has one system call, trap #15. Learn every task the emulator supports: printing and reading, the graphics tasks, the keyboard and the mouse, and program time."
/>
