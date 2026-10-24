<script lang="ts">
    import PageMeta from '#cmp/shared/layout/PageMeta.svelte'
    import { page } from '$app/state'
    import { breadcrumbLd, documentationArticleLd } from '#lib/seo.ts'
    import Page from '#cmp/shared/layout/Page.svelte'
    import ChapterView from '#cmp/documentation/ChapterView.svelte'
    import { chapters } from '#lib/documentation/riscv/riscv.ts'

    const chapter = chapters().find((chapter) => chapter.id === 'synth')!

    let jsonLd = $derived([
        breadcrumbLd([
            { name: 'Documentation', pathname: '/documentation' },
            { name: 'RISC-V', pathname: '/documentation/risc-v' },
            { name: 'RISC-V Synth', pathname: page.url.pathname }
        ]),
        documentationArticleLd({
            headline: 'RISC-V Synth',
            description:
                'Program the RISC-V Synth at 0xFFFF0100: eight sound channels controlled through memory registers, with waveforms, volume envelopes, programmable wavetables and sample playback.',
            pathname: page.url.pathname,
            section: { name: 'RISC-V assembly reference', pathname: '/documentation/risc-v' }
        })
    ])
</script>

<PageMeta
    title="RISC-V Synth: waveform sound chip | Asm Editor"
    description="Program the RISC-V Synth at 0xFFFF0100: eight sound channels controlled through memory registers, with waveforms, volume envelopes, programmable wavetables and sample playback."
    type="article"
    {jsonLd}
/>
<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>RISC-V Synth</h1>
    <ChapterView {chapter} />
</Page>
