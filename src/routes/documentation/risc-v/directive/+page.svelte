<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import RISCVDirectiveDocumentation from '$cmp/documentation/riscv/RISCVDirectiveDocumentation.svelte'
</script>

<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>RISC-V directives</h1>
    <p>
        RISC-V directives are used to define the structure of the program. They are not instructions
        that are executed by the CPU, but rather instructions that are used by the assembler to
        define the structure of the program.
    </p>
    <RISCVDirectiveDocumentation />
</Page>
