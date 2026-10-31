<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/x86/x86.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'input')!
</script>

<ChapterView
    {chapter}
    heading="x86-64 Keys and the Pointer"
    title="x86-64 Keys and the Pointer: /dev/input and the Terminal"
    description="Read the keyboard and the pointer of the x86 Screen through /dev/input: find devices with EVIOCGBIT, read struct input_event, convert the tablet's position to pixels, wait with poll, and read the Terminal's keys one at a time with tcsetattr."
/>
