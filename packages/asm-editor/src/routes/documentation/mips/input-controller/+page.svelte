<script lang="ts">
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/mips/mips.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'input-controller')!
</script>

<ChapterView
    {chapter}
    heading="MIPS Input controller"
    title="MIPS Input controller: keyboard and mouse registers | Asm Editor"
    description="Read held keys, key presses and releases, mouse buttons, pointer position and wheel events in MIPS assembly and C."
/>
