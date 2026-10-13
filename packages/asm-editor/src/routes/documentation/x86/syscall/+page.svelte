<script lang="ts">
    import PageMeta from '#cmp/shared/layout/PageMeta.svelte'
    import { page } from '$app/state'
    import { breadcrumbLd, documentationArticleLd } from '#lib/seo.ts'
    import Page from '#cmp/shared/layout/Page.svelte'
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/x86/x86.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'syscalls')!

    let jsonLd = $derived([
        breadcrumbLd([
            { name: 'Documentation', pathname: '/documentation' },
            { name: 'x86-64', pathname: '/documentation/x86' },
            { name: 'x86-64 syscalls', pathname: page.url.pathname }
        ]),
        documentationArticleLd({
            headline: 'x86-64 syscalls',
            description:
                'The Linux syscalls an x86-64 program can make in this emulator: their numbers, the registers they read their arguments from, and what each one does.',
            pathname: page.url.pathname,
            section: { name: 'x86-64 assembly reference', pathname: '/documentation/x86' }
        })
    ])
</script>

<PageMeta
    title="x86-64 Linux syscall reference | Asm Editor"
    description="The Linux syscalls an x86-64 program can make in this emulator: their numbers, the registers they read their arguments from, and what each one does."
    type="article"
    {jsonLd}
/>
<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>x86-64 syscalls</h1>
    <ChapterView {chapter} />
</Page>
