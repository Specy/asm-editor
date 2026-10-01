<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import ChapterView from '$cmp/documentation/ChapterView.svelte'
    import { chapters } from '$lib/documentation/m68k/m68k'

    const chapter = chapters().find((chapter) => chapter.id === 'shift-directions')!
</script>

<svelte:head>
    <title>M68K Shift Directions</title>
    <meta
        name="description"
        content="Shift directions in M68K specify the direction in which bits are shifted. Learn about the shift logical, shift arithmetical, and rotate directions."
    />
    <meta
        property="og:description"
        content="Shift directions in M68K specify the direction in which bits are shifted. Learn about the shift logical, shift arithmetical, and rotate directions."
    />
</svelte:head>

<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>Shift Directions</h1>
    <ChapterView {chapter} />
</Page>
