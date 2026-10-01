<script lang="ts">
    /**
     * The whole Z80 Documentation on one page: the Documentation panel's browser at full width
     * ([the design record](../../../../../docs/design/documentation-search.md), Search on the
     * documentation pages), prerendered with every row. Searching it is the palette's job, as on
     * every page of the site.
     */
    import Page from '$cmp/shared/layout/Page.svelte'
    import DocumentationBrowser from '$cmp/documentation/browser/DocumentationBrowser.svelte'
    import { chapters } from '$lib/documentation/z80/z80'
</script>

<svelte:head>
    <title>Z80 Complete Documentation</title>
    <meta
        name="description"
        content="Complete Z80 documentation in a single page. Includes all instructions, assembler directives, registers and flags, and the console ports."
    />
    <meta
        property="og:description"
        content="Complete Z80 documentation in a single page. Includes all instructions, assembler directives, registers and flags, and the console ports."
    />
</svelte:head>

<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>Z80 Complete Documentation</h1>
    <DocumentationBrowser language="z80" chapters={chapters()} variant="page" />
</Page>
