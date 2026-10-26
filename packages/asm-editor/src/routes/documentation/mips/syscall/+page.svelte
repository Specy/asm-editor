<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/mips/mips.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'syscalls')!
</script>

<ChapterView
    {chapter}
    heading="MIPS Syscalls"
    title="MIPS syscall reference (MARS) | Asm Editor"
    description="Syscalls in MIPS are used to make requests to the operating system. Learn how to use them and the available syscalls."
/>
