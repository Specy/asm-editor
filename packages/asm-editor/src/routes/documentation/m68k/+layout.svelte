<script lang="ts">
    import DocumentationLayout from '#cmp/documentation/site/DocumentationLayout.svelte'
    import { M68KUncompoundedInstructions } from '#lib/languages/M68K/M68K-documentation.ts'

    let { children }: { children: import('svelte').Snippet } = $props()

    // Every member of a family has its own page.
    const names = [...M68KUncompoundedInstructions.keys()]
</script>

<DocumentationLayout language="m68k" {names}>
    {@render children()}
</DocumentationLayout>
