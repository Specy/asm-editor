<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import MipsDirectiveDocumentation from '$cmp/documentation/mips/MIPSDirectiveDocumentation.svelte'
</script>

<svelte:head>
    <title>MIPS Directives</title>
    <meta
      name="description"
      content="MIPS directives are used by the assembler to execute operations at assembly time. Learn how to use them and the available directives."
    />
    <meta
      property="og:description"
      content="MIPS directives are used by the assembler to execute operations at assembly time. Learn how to use them and the available directives."
    />
</svelte:head>

<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>MIPS directives</h1>
    <p>
        MIPS directives are used to define the structure of the program. They are not instructions
        that are executed by the CPU, but rather instructions that are used by the assembler to
        define the structure of the program.
    </p>
    <MipsDirectiveDocumentation />
</Page>
