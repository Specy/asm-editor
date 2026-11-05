<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/x86/x86.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'sound')!
</script>

<ChapterView
    {chapter}
    heading="x86-64 Sound"
    title="x86-64 Sound: /dev/dsp, MIDI and the PC speaker - ASM Editor"
    description="Play PC speaker tones, MIDI notes or audio samples from x86. Configure playback buffering and volume through /dev/dsp and /dev/mixer."
/>
