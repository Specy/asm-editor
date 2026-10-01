<script lang="ts">
    /**
     * The whole M68K Documentation on one page: the Documentation panel's browser at full width
     * ([the design record](../../../../../docs/design/documentation-search.md), Search on the
     * documentation pages), prerendered with every row. Searching it is the palette's job, as on
     * every page of the site.
     */
    import Page from '$cmp/shared/layout/Page.svelte'
    import DocumentationBrowser from '$cmp/documentation/browser/DocumentationBrowser.svelte'
    import { chapters } from '$lib/documentation/m68k/m68k'
</script>

<svelte:head>
    <title>M68K Complete Documentation</title>
    <meta
        name="description"
        content="Complete M68K documentation in a single page. Includes all instructions, addressing modes, condition codes, directives, and assembler features."
    />
    <meta
        property="og:description"
        content="Complete M68K documentation in a single page. Includes all instructions, addressing modes, condition codes, directives, and assembler features."
    />
</svelte:head>

<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>M68K Complete Documentation</h1>
    <DocumentationBrowser language="m68k" chapters={chapters()} variant="page" />
</Page>
