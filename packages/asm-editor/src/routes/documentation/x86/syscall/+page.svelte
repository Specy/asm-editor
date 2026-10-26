<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/x86/x86.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'syscalls')!
</script>

<ChapterView
    {chapter}
    heading="x86-64 syscalls"
    title="x86-64 Linux syscall reference | Asm Editor"
    description="The Linux syscalls an x86-64 program can make in this emulator: their numbers, the registers they read their arguments from, and what each one does."
/>
