<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import Z80DirectiveDocumentation from '$cmp/documentation/z80/Z80DirectiveDocumentation.svelte'
</script>

<svelte:head>
    <title>Z80 Directives</title>
    <meta
        name="description"
        content="Z80 assembler directives place code in memory, define data and constants, include files and expand macros. Learn how to use them and the available directives."
    />
    <meta
        property="og:description"
        content="Z80 assembler directives place code in memory, define data and constants, include files and expand macros. Learn how to use them and the available directives."
    />
</svelte:head>
<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>Z80 directives</h1>
    <p>
        Directives are not executed by the CPU: they tell the assembler where to put the code, what
        data to emit, which names stand for which values, and when to expand a macro. Most of them
        have several accepted spellings, so sources written for other Z80 assemblers usually
        assemble unchanged.
    </p>
    <Z80DirectiveDocumentation />
</Page>
