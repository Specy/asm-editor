<script lang="ts">
    import PageMeta from '#cmp/shared/layout/PageMeta.svelte'
    import { page } from '$app/state'
    import { breadcrumbLd, documentationArticleLd } from '#lib/seo.ts'
    import Page from '#cmp/shared/layout/Page.svelte'
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/riscv/riscv.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'syscalls')!

    let jsonLd = $derived([
        breadcrumbLd([
            { name: 'Documentation', pathname: '/documentation' },
            { name: 'RISC-V', pathname: '/documentation/risc-v' },
            { name: 'RISC-V Syscalls', pathname: page.url.pathname }
        ]),
        documentationArticleLd({
            headline: 'RISC-V Syscalls',
            description:
                'Syscalls in RISC-V are used to make requests to the operating system. Learn how to use them and the available syscalls.',
            pathname: page.url.pathname,
            section: { name: 'RISC-V assembly reference', pathname: '/documentation/risc-v' }
        })
    ])
</script>

<PageMeta
    title="RISC-V ecall syscall reference (RARS) | Asm Editor"
    description="Syscalls in RISC-V are used to make requests to the operating system. Learn how to use them and the available syscalls."
    type="article"
    {jsonLd}
/>

<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>RISC-V Syscalls</h1>
    <ChapterView {chapter} />
</Page>
