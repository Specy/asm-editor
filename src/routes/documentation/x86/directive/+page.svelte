<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import X86DirectiveDocumentation from '$cmp/documentation/x86/X86DirectiveDocumentation.svelte'
</script>

<svelte:head>
    <title>x86-64 Directives</title>
    <meta
        name="description"
        content="NASM directives place code and data in sections, reserve space, define constants and macros, and control the preprocessor. Learn how to use them and which ones the assembler accepts."
    />
    <meta
        property="og:description"
        content="NASM directives place code and data in sections, reserve space, define constants and macros, and control the preprocessor. Learn how to use them and which ones the assembler accepts."
    />
</svelte:head>
<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>x86-64 directives</h1>
    <p class="text-muted">
        Directives are not executed by the processor: they tell the assembler where to put code and
        data, what bytes to emit, which names stand for which values, and when to expand a macro.
        The list is NASM's own, so it is what this editor accepts rather than what another assembler
        might.
    </p>
    <X86DirectiveDocumentation />
</Page>
