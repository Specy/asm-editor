<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/riscv/riscv.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'registers')!
</script>

<ChapterView
    {chapter}
    heading="RISC-V Registers"
    title="RISC-V Registers"
    description="RISC-V registers reference: the 32 general purpose registers with their ABI names, the floating point registers, and the control and status registers the simulator implements."
/>
