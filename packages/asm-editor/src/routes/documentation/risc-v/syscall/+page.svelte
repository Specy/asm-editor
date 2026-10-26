<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/riscv/riscv.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'syscalls')!
</script>

<ChapterView
    {chapter}
    heading="RISC-V Syscalls"
    title="RISC-V ecall syscall reference (RARS) | Asm Editor"
    description="Syscalls in RISC-V are used to make requests to the operating system. Learn how to use them and the available syscalls."
/>
