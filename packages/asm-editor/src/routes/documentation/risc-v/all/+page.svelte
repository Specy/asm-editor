<script lang="ts">
    /**
     * The whole RISC-V Documentation on one page: the Documentation panel's browser at full width
     * ([the design record](../../../../../../../docs/design/documentation-search.md), Search on the
     * documentation pages), prerendered with every row. Searching it is the palette's job, as on
     * every page of the site.
     */
    import Page from '#cmp/shared/layout/Page.svelte'
    import Header from '#cmp/shared/layout/Header.svelte'
    import PageMeta from '#cmp/shared/layout/PageMeta.svelte'
    import DocumentationBrowser from '#cmp/documentation/browser/DocumentationBrowser.svelte'
    import { chapters } from '#lib/documentation/riscv/riscv.ts'
</script>

<PageMeta
    title="RISC-V Complete Documentation - ASM Editor"
    description="Complete RISC-V documentation in a single page. Includes all instructions, directives, and syscalls."
    type="article"
/>

<Page cropped="70rem" contentStyle="padding: 1rem; gap: 1rem;">
    <Header>RISC-V Complete Documentation</Header>
    <DocumentationBrowser language="risc-v" chapters={chapters()} variant="page" />
</Page>
