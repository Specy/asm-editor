<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import M68KExceptionsDocumentation from '$cmp/documentation/m68k/M68KExceptionsDocumentation.svelte'
</script>

<svelte:head>
    <title>M68K Exceptions and the Vector Table</title>
    <meta
        name="description"
        content="How a real 68000 handles exceptions, interrupts and traps: the 256 entry vector table, the five steps the CPU takes, and what this editor does instead, since none of it is implemented here."
    />
    <meta
        property="og:description"
        content="How a real 68000 handles exceptions, interrupts and traps: the 256 entry vector table, the five steps the CPU takes, and what this editor does instead, since none of it is implemented here."
    />
</svelte:head>
<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>Exceptions and the vector table</h1>
    <M68KExceptionsDocumentation />
</Page>
