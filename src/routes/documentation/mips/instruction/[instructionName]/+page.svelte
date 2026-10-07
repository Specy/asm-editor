<script lang="ts">
    import type { PageData } from './$types'
    import { page } from '$app/state'
    import { toMetaDescription, jsonLdScriptTag, instructionLd } from '$lib/seo'
    import Page from '$cmp/shared/layout/Page.svelte'
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
    import InstructionExample from '$cmp/documentation/site/InstructionExample.svelte'
    import { formatAggregatedArgs } from '$lib/languages/MIPS/MIPS-documentation'
    interface Props {
        data: PageData
    }

    let { data }: Props = $props()
    let ins = $derived(data.props.instruction[0])

    // "Docs - move" matched no query anyone types; "MOVE - M68K instruction reference"
    // matches how these are actually searched for.
    let pageTitle = $derived(`${String(ins.name).toUpperCase()} - MIPS instruction reference`)
    // The raw description is markdown, and was reaching search results with its link
    // syntax and newlines intact.
    let metaDescription = $derived(
        toMetaDescription(`The ${ins.name} MIPS instruction. ${data.props.description}`)
    )
    let structuredData = $derived(
        instructionLd({
            name: String(ins.name),
            architecture: 'MIPS',
            description: data.props.description,
            pathname: page.url.pathname
        })
    )
</script>

<svelte:head>
    <title>{pageTitle}</title>
    <meta name="description" content={metaDescription} />
    <meta property="og:title" content={pageTitle} />
    <meta property="og:description" content={metaDescription} />
    <meta property="og:type" content="article" />
    <!-- The page's schema.org description. {@html} is the only way to emit a <script>
         from a component: <svelte:element this="script"> renders nothing in Svelte, and a
         literal script tag here is taken as the component's own instance script. Safe
         because the payload is machine generated and serializeJsonLd escapes < > and &,
         so nothing interpolated can close the tag. -->
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html jsonLdScriptTag(structuredData)}
</svelte:head>

<Page contentStyle="padding: 1rem; gap: 1rem;">
    <div class="instruction-info" style="flex: 1;">
        <Column>
            <h1 class="instruction-name">
                {ins.name}
            </h1>
        </Column>

        <Column gap="1rem" flex1>
            <Column gap="1rem">
                <h2>Operands</h2>
                <span>
                    {formatAggregatedArgs(data.props.instruction)}
                </span>
            </Column>

            <article class="description">
                <MarkdownRenderer source={data.props.description} centered={false} />
            </article>

            <Column style="gap: 1rem">
                <h2>Variants</h2>
                <MarkdownRenderer
                    centered={false}
                    source={data.props.instruction
                        .map((v) => `- ${v.description} **${v.example?.trim()}**`)
                        .join('\n')}
                />
            </Column>
        </Column>
    </div>
    <InstructionExample instructionKey={ins.name} example={data.props.content?.example} />
</Page>

<style lang="scss">
    .instruction-info {
        display: flex;
        gap: 1rem;
    }
    .instruction-name {
        font-size: 4rem;
        margin-top: 0;
        line-height: 1.1;
        margin-right: 2rem;
        min-width: 11.2rem;
        font-weight: 600;
        color: var(--accent);
        margin-bottom: 1rem;
    }
    .description {
        font-size: 1.1rem;
        line-height: 1.4rem;
        width: 100%;
    }
    :global(.description a) {
        color: var(--accent);
        text-decoration: underline;
    }
    @media (max-width: 800px) {
        .instruction-info {
            flex-direction: column;
        }
    }
</style>
