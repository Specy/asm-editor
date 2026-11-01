<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/x86/x86.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'screen')!
</script>

<ChapterView
    {chapter}
    heading="x86-64 Screen"
    title="x86-64 Screen and /dev/fb0"
    description="Draw on the x86 Screen through /dev/fb0: read its size with the framebuffer ioctls, map its pixels with mmap, double buffer with FBIOPAN_DISPLAY and FBIO_WAITFORVSYNC, and set its size with an @screen comment."
/>
