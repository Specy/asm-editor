<script lang="ts">
    import Column from '$cmp/shared/layout/Column.svelte'
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import { mipsDirectivesMap } from '$lib/languages/MIPS-documentation'
    import Page from '$cmp/shared/layout/Page.svelte'
    import Card from '$cmp/shared/layout/Card.svelte'
    import MipsDirectiveDocumentation from '$cmp/documentation/mips/MIPSDirectiveDocumentation.svelte'
</script>

<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>MIPS directives</h1>
    <p>
        MIPS directives are used to define the structure of the program. They are not instructions
        that are executed by the CPU, but rather instructions that are used by the assembler to
        define the structure of the program.
    </p>
    <MipsDirectiveDocumentation />
</Page>
