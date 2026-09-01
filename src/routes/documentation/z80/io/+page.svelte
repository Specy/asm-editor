<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import Z80IoDocumentation from '$cmp/documentation/z80/Z80IoDocumentation.svelte'
</script>

<svelte:head>
    <title>Z80 Input/Output</title>
    <meta
        name="description"
        content="The Z80 has no syscalls: programs print and read through the in and out instructions. Learn the console ports of the emulator, with runnable examples."
    />
    <meta
        property="og:description"
        content="The Z80 has no syscalls: programs print and read through the in and out instructions. Learn the console ports of the emulator, with runnable examples."
    />
</svelte:head>
<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>Z80 Input/Output</h1>
    <Z80IoDocumentation />
</Page>
