<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import MipsRegistersDocumentation from '$cmp/documentation/mips/MIPSRegistersDocumentation.svelte'
</script>
<svelte:head>
    <title>MIPS Registers</title>
    <meta name="description" content="MIPS registers reference." />
</svelte:head>
<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>MIPS Registers</h1>
    <p>The MIPS architecture has 32 general-purpose registers, $HI and $LO registers for multiplication and division, and another 32 for floating point numbers.</p>
    <MipsRegistersDocumentation />
</Page>
