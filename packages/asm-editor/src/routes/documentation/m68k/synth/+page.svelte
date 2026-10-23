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
                'M68K programs can play waveforms on the Synth, a memory-mapped sound chip at $E00100 that this editor adds beside EASy68K: eight channels of pulse, triangle, sawtooth, sine, noise, wavetable and sampled sound, each with an envelope.',
            pathname: page.url.pathname,
            section: { name: 'M68K assembly reference', pathname: '/documentation/m68k' }
        })
    ])
</script>

<PageMeta
    title="M68K Synth: waveform sound chip | Asm Editor"
    description="M68K programs can play waveforms on the Synth, a memory-mapped sound chip at $E00100 that this editor adds beside EASy68K: eight channels of pulse, triangle, sawtooth, sine, noise, wavetable and sampled sound, each with an envelope."
    type="article"
    {jsonLd}
/>
<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>M68K Synth</h1>
    <ChapterView {chapter} />
</Page>
