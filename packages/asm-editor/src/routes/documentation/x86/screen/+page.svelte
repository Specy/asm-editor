<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/x86/x86.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'screen')!
</script>

<ChapterView
    {chapter}
    heading="x86-64 Screen"
    title="x86-64 Screen and /dev/fb0 - ASM Editor"
    description="Draw pixels and switch framebuffer pages through /dev/fb0. Configure the x86 Screen size with Display or @screen."
/>
