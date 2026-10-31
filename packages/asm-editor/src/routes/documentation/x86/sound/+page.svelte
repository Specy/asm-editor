<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/x86/x86.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'sound')!
</script>

<ChapterView
    {chapter}
    heading="x86-64 Sound"
    title="x86-64 Sound: /dev/dsp, MIDI and the PC speaker"
    description="Make sound from an x86 program: a tone on the PC speaker, General MIDI notes on /dev/snd/midiC1D0, samples on /dev/dsp with SNDCTL_DSP_SETFRAGMENT for low latency, and the volume on /dev/mixer."
/>
