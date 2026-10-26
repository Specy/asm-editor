<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/m68k/m68k.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'synth')!
</script>

<ChapterView
    {chapter}
    heading="M68K Synth"
    title="M68K Synth: waveform sound chip | Asm Editor"
    description="Program the M68K Synth at $E00100: eight sound channels controlled through memory registers, with waveforms, volume envelopes, programmable wavetables and sample playback."
/>
