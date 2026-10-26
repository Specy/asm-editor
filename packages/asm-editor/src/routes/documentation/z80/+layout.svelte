<script lang="ts">
    import DocumentationLayout from '#cmp/documentation/site/DocumentationLayout.svelte'
    import { z80InstructionNames } from '#lib/languages/Z80/Z80-documentation.ts'

    let { children }: { children: import('svelte').Snippet } = $props()
</script>

<DocumentationLayout language="z80" names={z80InstructionNames}>
    {@render children()}
</DocumentationLayout>
