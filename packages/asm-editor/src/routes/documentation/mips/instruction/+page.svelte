<script lang="ts">
    import InstructionIndex from '#cmp/documentation/site/InstructionIndex.svelte'
    import { mipsInstructionNames } from '#lib/languages/MIPS/MIPS-documentation.ts'
</script>

<InstructionIndex
    language="mips"
    names={mipsInstructionNames}
    description="Read the MIPS documentation, including all the instructions with addressing modes and the assembler features"
/>
