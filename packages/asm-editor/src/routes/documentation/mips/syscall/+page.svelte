<script lang="ts">
    import PageMeta from '#cmp/shared/layout/PageMeta.svelte'
    import { page } from '$app/state'
    import { breadcrumbLd, documentationArticleLd } from '#lib/seo.ts'
    import Page from '#cmp/shared/layout/Page.svelte'
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/mips/mips.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'syscalls')!

    let jsonLd = $derived([
        breadcrumbLd([
            { name: 'Documentation', pathname: '/documentation' },
            { name: 'MIPS', pathname: '/documentation/mips' },
            { name: 'MIPS Syscalls', pathname: page.url.pathname }
        ]),
        documentationArticleLd({
            headline: 'MIPS Syscalls',
            description:
                'Syscalls in MIPS are used to make requests to the operating system. Learn how to use them and the available syscalls.',
            pathname: page.url.pathname,
            section: { name: 'MIPS assembly reference', pathname: '/documentation/mips' }
        })
    ])
</script>

<PageMeta
    title="MIPS syscall reference (MARS) | Asm Editor"
    description="Syscalls in MIPS are used to make requests to the operating system. Learn how to use them and the available syscalls."
    type="article"
    {jsonLd}
/>

<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>MIPS Syscalls</h1>
    <ChapterView {chapter} />
</Page>
