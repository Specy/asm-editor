<script lang="ts">
    /**
     * The whole x86 Documentation on one page: the Documentation panel's browser at full width
     * ([the design record](../../../../../docs/design/documentation-search.md), Search on the
     * documentation pages), prerendered with every row. Searching it is the palette's job, as on
     * every page of the site.
     */
    import Page from '$cmp/shared/layout/Page.svelte'
    import DocumentationBrowser from '$cmp/documentation/browser/DocumentationBrowser.svelte'
    import { chapters } from '$lib/documentation/x86/x86'
</script>

<svelte:head>
    <title>x86-64 Complete Documentation</title>
    <meta
        name="description"
        content="Complete x86-64 documentation in a single page. Includes the integer instruction set, every mnemonic the assembler accepts, the directives, the registers and flags, the SSE and x87 floating point registers, and the syscalls."
    />
    <meta
        property="og:description"
        content="Complete x86-64 documentation in a single page. Includes the integer instruction set, every mnemonic the assembler accepts, the directives, the registers and flags, the SSE and x87 floating point registers, and the syscalls."
    />
</svelte:head>

<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>x86-64 Complete Documentation</h1>
    <DocumentationBrowser language="x86" chapters={chapters()} variant="page" />
</Page>
