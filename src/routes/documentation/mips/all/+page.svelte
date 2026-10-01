<script lang="ts">
    /**
     * The whole MIPS Documentation on one page: the Documentation panel's browser at full width
     * ([the design record](../../../../../docs/design/documentation-search.md), Search on the
     * documentation pages), prerendered with every row. Searching it is the palette's job, as on
     * every page of the site.
     */
    import Page from '$cmp/shared/layout/Page.svelte'
    import DocumentationBrowser from '$cmp/documentation/browser/DocumentationBrowser.svelte'
    import { chapters } from '$lib/documentation/mips/mips'
</script>

<svelte:head>
    <title>MIPS Complete Documentation</title>
    <meta
        name="description"
        content="Complete MIPS documentation in a single page. Includes all instructions, directives, and syscalls."
    />
    <meta
        property="og:description"
        content="Complete MIPS documentation in a single page. Includes all instructions, directives, and syscalls."
    />
</svelte:head>

<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>MIPS Complete Documentation</h1>
    <DocumentationBrowser language="mips" chapters={chapters()} variant="page" />
</Page>
