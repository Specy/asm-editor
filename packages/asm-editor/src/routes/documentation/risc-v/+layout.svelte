<script lang="ts">
    import DocumentationLayout from '#cmp/documentation/site/DocumentationLayout.svelte'
    import { riscvInstructionNames } from '#lib/languages/RISC-V/RISC-V-documentation.ts'

    let { children }: { children: import('svelte').Snippet } = $props()
</script>

<DocumentationLayout language="risc-v" names={riscvInstructionNames}>
    {@render children()}
</DocumentationLayout>
