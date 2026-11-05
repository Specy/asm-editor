<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/riscv/riscv.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'midi-and-audio')!
</script>

<ChapterView
    {chapter}
    heading="RISC-V MIDI and sampled audio"
    title="RISC-V MIDI port and sampled-audio output - ASM Editor"
    description="Play MIDI notes and stream audio samples from RISC-V programs, with examples in assembly and C."
/>
