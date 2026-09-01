<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import Z80RegistersDocumentation from '$cmp/documentation/z80/Z80RegistersDocumentation.svelte'
</script>

<svelte:head>
    <title>Z80 Registers & Flags</title>
    <meta
        name="description"
        content="The Z80 registers and flags: the accumulator, the general purpose pairs, the index registers, the alternate set, and the six flags of the F register."
    />
    <meta
        property="og:description"
        content="The Z80 registers and flags: the accumulator, the general purpose pairs, the index registers, the alternate set, and the six flags of the F register."
    />
</svelte:head>
<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>Z80 Registers & Flags</h1>
    <p>
        The Z80 has seven general purpose 8 bit registers plus the accumulator, which pair up into
        16 bit registers, two index registers, a stack pointer and a program counter. A second,
        alternate set of the same registers is swapped in with a single instruction, which is why
        interrupt handlers on real hardware could save the machine state in four clock cycles.
    </p>
    <Z80RegistersDocumentation />
</Page>
