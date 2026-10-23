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
                'RISC-V programs can play waveforms on the Synth, a memory-mapped sound chip at 0xFFFF0100 that this editor adds beside RARS: eight channels of pulse, triangle, sawtooth, sine, noise, wavetable and sampled sound, each with an envelope.',
            pathname: page.url.pathname,
            section: { name: 'RISC-V assembly reference', pathname: '/documentation/risc-v' }
        })
    ])
</script>

<PageMeta
    title="RISC-V Synth: waveform sound chip | Asm Editor"
    description="RISC-V programs can play waveforms on the Synth, a memory-mapped sound chip at 0xFFFF0100 that this editor adds beside RARS: eight channels of pulse, triangle, sawtooth, sine, noise, wavetable and sampled sound, each with an envelope."
    type="article"
    {jsonLd}
/>
<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>RISC-V Synth</h1>
    <ChapterView {chapter} />
</Page>
