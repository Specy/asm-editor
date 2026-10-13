<script lang="ts">
    import PageMeta from '#cmp/shared/layout/PageMeta.svelte'
    import { page } from '$app/state'
    import { breadcrumbLd, documentationArticleLd } from '#lib/seo.ts'
    import Page from '#cmp/shared/layout/Page.svelte'
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/m68k/m68k.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'trap-tasks')!

    let jsonLd = $derived([
        breadcrumbLd([
            { name: 'Documentation', pathname: '/documentation' },
            { name: 'M68K', pathname: '/documentation/m68k' },
            { name: 'M68K Trap Tasks', pathname: page.url.pathname }
        ]),
        documentationArticleLd({
            headline: 'M68K Trap Tasks',
            description:
                'The M68K has one system call, trap #15. Learn every task the emulator supports: printing and reading, the graphics tasks, the keyboard and the mouse, and program time.',
            pathname: page.url.pathname,
            section: { name: 'M68K assembly reference', pathname: '/documentation/m68k' }
        })
    ])
</script>

<PageMeta
    title="M68K trap #15 task reference (EASy68K) | Asm Editor"
    description="The M68K has one system call, trap #15. Learn every task the emulator supports: printing and reading, the graphics tasks, the keyboard and the mouse, and program time."
    type="article"
    {jsonLd}
/>
<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>M68K Trap Tasks</h1>
    <ChapterView {chapter} />
</Page>
