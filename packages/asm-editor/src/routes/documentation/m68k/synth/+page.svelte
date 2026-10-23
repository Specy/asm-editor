<script lang="ts">
    import PageMeta from '#cmp/shared/layout/PageMeta.svelte'
    import { page } from '$app/state'
    import { breadcrumbLd, documentationArticleLd } from '#lib/seo.ts'
    import Page from '#cmp/shared/layout/Page.svelte'
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/m68k/m68k.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'synth')!

    let jsonLd = $derived([
        breadcrumbLd([
            { name: 'Documentation', pathname: '/documentation' },
            { name: 'M68K', pathname: '/documentation/m68k' },
            { name: 'M68K Synth', pathname: page.url.pathname }
        ]),
        documentationArticleLd({
            headline: 'M68K Synth',
            description:
                'Program the M68K Synth at $E00100: eight sound channels controlled through memory registers, with waveforms, volume envelopes, programmable wavetables and sample playback.',
            pathname: page.url.pathname,
            section: { name: 'M68K assembly reference', pathname: '/documentation/m68k' }
        })
    ])
</script>

<PageMeta
    title="M68K Synth: waveform sound chip | Asm Editor"
    description="Program the M68K Synth at $E00100: eight sound channels controlled through memory registers, with waveforms, volume envelopes, programmable wavetables and sample playback."
    type="article"
    {jsonLd}
/>
<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>M68K Synth</h1>
    <ChapterView {chapter} />
</Page>
