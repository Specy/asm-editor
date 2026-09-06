<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import MarsScreenDocumentation from '$cmp/documentation/mars/MarsScreenDocumentation.svelte'
</script>

<svelte:head>
    <title>RISC-V Screen and Memory-Mapped I/O</title>
    <meta
        name="description"
        content="RISC-V programs draw through memory: the bitmap display maps one word to one pixel, and four words at 0xffff0000 carry the keyboard and the console. Learn RARS's parameters, the registers and program time."
    />
    <meta
        property="og:description"
        content="RISC-V programs draw through memory: the bitmap display maps one word to one pixel, and four words at 0xffff0000 carry the keyboard and the console. Learn RARS's parameters, the registers and program time."
    />
</svelte:head>
<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>RISC-V Screen and Memory-Mapped I/O</h1>
    <MarsScreenDocumentation variant="RISC-V" />
</Page>
