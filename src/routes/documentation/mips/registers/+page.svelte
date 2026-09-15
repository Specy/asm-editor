<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import MipsRegistersDocumentation from '$cmp/documentation/mips/MIPSRegistersDocumentation.svelte'
</script>

<svelte:head>
    <title>MIPS Registers</title>
    <meta
        name="description"
        content="MIPS registers reference: the 32 general purpose registers, the floating point registers of coprocessor 1 with their condition flags, and the coprocessor 0 exception registers."
    />
    <meta
        property="og:description"
        content="MIPS registers reference: the 32 general purpose registers, the floating point registers of coprocessor 1 with their condition flags, and the coprocessor 0 exception registers."
    />
</svelte:head>
<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>MIPS Registers</h1>
    <p class="text-muted">
        The MIPS architecture has 32 general-purpose registers, $HI and $LO registers for
        multiplication and division, and two coprocessors with registers of their own: coprocessor 1
        holds the 32 floating point registers, coprocessor 0 the registers an exception writes. The
        registers panel of the editor shows each of the three as its own tab.
    </p>
    <MipsRegistersDocumentation />
</Page>
