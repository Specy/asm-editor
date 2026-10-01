<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import ChapterView from '$cmp/documentation/ChapterView.svelte'
    import { chapters } from '$lib/documentation/x86/x86'

    const chapter = chapters().find((chapter) => chapter.id === 'extensions')!
</script>

<svelte:head>
    <title>x86-64 Extensions</title>
    <meta
        name="description"
        content="Every x86-64 instruction NASM accepts beyond the integer instruction set: the SSE, AVX and AVX-512 vector extensions, the x87 floating point unit and the system instructions, under the headings NASM files them under, each with its one line summary."
    />
    <meta
        property="og:description"
        content="Every x86-64 instruction NASM accepts beyond the integer instruction set: the SSE, AVX and AVX-512 vector extensions, the x87 floating point unit and the system instructions, under the headings NASM files them under, each with its one line summary."
    />
</svelte:head>
<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>x86-64 extensions</h1>
    <ChapterView {chapter} />
</Page>
