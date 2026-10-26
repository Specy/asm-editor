<script lang="ts">
    import DocumentationLayout from '#cmp/documentation/site/DocumentationLayout.svelte'
    import { x86DocumentedNames } from '#lib/languages/X86/X86-documentation.ts'

    let { children }: { children: import('svelte').Snippet } = $props()
</script>

<!-- The integer instruction set, the same set that has pages. -->
<DocumentationLayout language="x86" names={x86DocumentedNames}>
    {@render children()}
</DocumentationLayout>
