<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/riscv/riscv.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'synth')!
</script>

<ChapterView
    {chapter}
    heading="RISC-V Synth"
    title="RISC-V Synth: waveform sound chip | Asm Editor"
    description="Program the RISC-V Synth at 0xFFFF0100: eight sound channels controlled through memory registers, with waveforms, volume envelopes, programmable wavetables and sample playback."
/>
