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
    <p>The MIPS architecture has 32 general-purpose registers that we have described in this section, but actually, there are also $HI and $LO registers for multiplication and division, and typically another 32 registers of 32 bits each for floating point numbers.</p>
    <MipsRegistersDocumentation />
</Page>
