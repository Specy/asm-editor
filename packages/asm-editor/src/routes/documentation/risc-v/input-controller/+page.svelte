<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/riscv/riscv.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'input-controller')!
</script>

<ChapterView
    {chapter}
    heading="RISC-V Input controller"
    title="RISC-V Input controller: keyboard and mouse registers | Asm Editor"
    description="Read the keyboard and the mouse from a RISC-V program at 0xFFFF0300: keys held, key and button events in a queue, the pointer and the wheel, with examples in assembly and C."
/>
