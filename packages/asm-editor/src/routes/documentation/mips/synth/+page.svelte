<script lang="ts">
    import PageMeta from '#cmp/shared/layout/PageMeta.svelte'
    import { page } from '$app/state'
    import { breadcrumbLd, documentationArticleLd } from '#lib/seo.ts'
    import Page from '#cmp/shared/layout/Page.svelte'
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/mips/mips.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'synth')!

    let jsonLd = $derived([
        breadcrumbLd([
            { name: 'Documentation', pathname: '/documentation' },
            { name: 'MIPS', pathname: '/documentation/mips' },
            { name: 'MIPS Synth', pathname: page.url.pathname }
        ]),
        documentationArticleLd({
            headline: 'MIPS Synth',
            description:
                'Program the MIPS Synth at 0xFFFF0100: eight sound channels controlled through memory registers, with waveforms, volume envelopes, programmable wavetables and sample playback.',
            pathname: page.url.pathname,
            section: { name: 'MIPS assembly reference', pathname: '/documentation/mips' }
        })
    ])
</script>

<PageMeta
    title="MIPS Synth: waveform sound chip | Asm Editor"
    description="Program the MIPS Synth at 0xFFFF0100: eight sound channels controlled through memory registers, with waveforms, volume envelopes, programmable wavetables and sample playback."
    type="article"
    {jsonLd}
/>
<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>MIPS Synth</h1>
    <ChapterView {chapter} />
</Page>
