<script lang="ts">
    /**
     * The whole M68K Documentation on one page: the Documentation panel's browser at full width
     * ([the design record](../../../../../../../docs/design/documentation-search.md), Search on the
     * documentation pages), prerendered with every row. Searching it is the palette's job, as on
     * every page of the site.
     */
    import Page from '#cmp/shared/layout/Page.svelte'
    import Header from '#cmp/shared/layout/Header.svelte'
    import PageMeta from '#cmp/shared/layout/PageMeta.svelte'
    import DocumentationBrowser from '#cmp/documentation/browser/DocumentationBrowser.svelte'
    import { chapters } from '#lib/documentation/m68k/m68k.ts'
</script>

<PageMeta
    title="M68K Complete Documentation - ASM Editor"
    description="Complete M68K documentation in a single page. Includes all instructions, addressing modes, condition codes, directives, and assembler features."
    type="article"
/>

<Page cropped="70rem" contentStyle="padding: 1rem; gap: 1rem;">
    <Header>M68K Complete Documentation</Header>
    <DocumentationBrowser language="m68k" chapters={chapters()} variant="page" />
</Page>
