<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/mips/mips.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'synth')!
</script>

<ChapterView
    {chapter}
    heading="MIPS Synth"
    title="MIPS Synth: waveform sound chip | Asm Editor"
    description="Program the MIPS Synth at 0xFFFF0100: eight sound channels controlled through memory registers, with waveforms, volume envelopes, programmable wavetables and sample playback."
/>
