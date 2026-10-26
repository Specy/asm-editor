<script lang="ts">
    import DocumentationLayout from '#cmp/documentation/site/DocumentationLayout.svelte'
    import { mipsInstructionNames } from '#lib/languages/MIPS/MIPS-documentation.ts'

    let { children }: { children: import('svelte').Snippet } = $props()
</script>

<DocumentationLayout language="mips" names={mipsInstructionNames}>
    {@render children()}
</DocumentationLayout>
