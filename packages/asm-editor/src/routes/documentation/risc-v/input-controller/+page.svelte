<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/riscv/riscv.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'input-controller')!
</script>

<ChapterView
    {chapter}
    heading="RISC-V Input controller"
    title="RISC-V Input controller: keyboard and mouse registers | Asm Editor"
    description="Read held keys, key presses and releases, mouse buttons, pointer position and wheel events in RISC-V assembly and C."
/>
