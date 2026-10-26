<script lang="ts">
    import InstructionIndex from '#cmp/documentation/site/InstructionIndex.svelte'
    import { M68KUncompoundedInstructions } from '#lib/languages/M68K/M68K-documentation.ts'

    // Every member of a family has its own page.
    const names = [...M68KUncompoundedInstructions.keys()]
</script>

<InstructionIndex
    language="m68k"
    {names}
    description="Read the M68K documentation, including all the instructions with addressing modes and the assembler features"
/>
