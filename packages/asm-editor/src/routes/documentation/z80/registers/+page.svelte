<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/z80/z80.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'registers-and-flags')!
</script>

<ChapterView
    {chapter}
    heading="Z80 Registers & Flags"
    title="Z80 Registers & Flags"
    description="The Z80 registers and flags: the accumulator, the general purpose pairs, the index registers, the alternate set, and the six flags of the F register."
/>
