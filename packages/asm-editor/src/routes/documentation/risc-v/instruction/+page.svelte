<script lang="ts">
    import InstructionIndex from '#cmp/documentation/site/InstructionIndex.svelte'
    import { riscvInstructionNames } from '#lib/languages/RISC-V/RISC-V-documentation.ts'
</script>

<InstructionIndex
    language="risc-v"
    names={riscvInstructionNames}
    description="Read the RISC-V Instructions documentation, including all the instructions with addressing modes and the assembler features"
/>
