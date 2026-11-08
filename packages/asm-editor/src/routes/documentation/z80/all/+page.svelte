<script lang="ts">
    /**
     * The whole Z80 Documentation on one page: the Documentation panel's browser at full width
     * ([the design record](../../../../../../../docs/design/documentation-search.md), Search on the
     * documentation pages), prerendered with every row. Searching it is the palette's job, as on
     * every page of the site.
     */
    import Page from '#cmp/shared/layout/Page.svelte'
    import Header from '#cmp/shared/layout/Header.svelte'
    import PageMeta from '#cmp/shared/layout/PageMeta.svelte'
    import DocumentationBrowser from '#cmp/documentation/browser/DocumentationBrowser.svelte'
    import { chapters } from '#lib/documentation/z80/z80.ts'
</script>

<PageMeta
    title="Z80 Complete Documentation - ASM Editor"
    description="Complete Z80 documentation in a single page. Includes all instructions, assembler directives, registers and flags, and the console ports."
    type="article"
/>

<Page cropped="70rem" contentStyle="padding: 1rem; gap: 1rem;">
    <Header>Z80 Complete Documentation</Header>
    <DocumentationBrowser language="z80" chapters={chapters()} variant="page" />
</Page>
