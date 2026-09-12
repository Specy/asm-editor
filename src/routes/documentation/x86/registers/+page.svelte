<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import X86RegistersDocumentation from '$cmp/documentation/x86/X86RegistersDocumentation.svelte'
</script>

<svelte:head>
    <title>x86-64 Registers & Flags</title>
    <meta
        name="description"
        content="The x86-64 registers, the four widths each one can be used at, the flags arithmetic writes, and the condition codes the conditional instructions read."
    />
    <meta
        property="og:description"
        content="The x86-64 registers, the four widths each one can be used at, the flags arithmetic writes, and the condition codes the conditional instructions read."
    />
</svelte:head>
<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>x86-64 registers & flags</h1>
    <X86RegistersDocumentation />
</Page>
