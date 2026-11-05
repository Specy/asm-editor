<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/mips/mips.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'midi-and-audio')!
</script>

<ChapterView
    {chapter}
    heading="MIPS MIDI and sampled audio"
    title="MIPS MIDI port and sampled-audio output - ASM Editor"
    description="Play MIDI notes and stream audio samples from MIPS programs, with examples in assembly and C."
/>
