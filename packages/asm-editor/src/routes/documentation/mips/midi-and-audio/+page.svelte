<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/mips/mips.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'midi-and-audio')!
</script>

<ChapterView
    {chapter}
    heading="MIPS MIDI and sampled audio"
    title="MIPS MIDI port and sampled-audio output | Asm Editor"
    description="Stream sound from a MIPS program: MIDI messages to a General MIDI synthesizer at 0xFFFF0340, and computed samples to a FIFO at 0xFFFF0350, with examples in assembly and C."
/>
