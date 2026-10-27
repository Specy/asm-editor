<script lang="ts">
    import InstructionIndex from '#cmp/documentation/site/InstructionIndex.svelte'
    import { z80InstructionNames } from '#lib/languages/Z80/Z80-documentation.ts'
</script>

<InstructionIndex
    language="z80"
    names={z80InstructionNames}
    code
    description="Read the Z80 instructions documentation, every mnemonic with all of its operand forms, the flags it changes, its size in bytes and its clock cycles"
/>
