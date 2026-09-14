<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import RiscvRegistersDocumentation from '$cmp/documentation/riscv/RISCVRegistersDocumentation.svelte'
</script>

<svelte:head>
    <title>RISC-V Registers</title>
    <meta
        name="description"
        content="RISC-V registers reference: the 32 general purpose registers with their ABI names, the floating point registers, and the control and status registers the simulator implements."
    />
    <meta
        property="og:description"
        content="RISC-V registers reference: the 32 general purpose registers with their ABI names, the floating point registers, and the control and status registers the simulator implements."
    />
</svelte:head>
<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>RISC-V Registers</h1>
    <p class="text-muted">
        A RISC-V processor holds three sets of registers: the 32 general purpose ones every
        instruction works on, the 32 floating point registers the extension adds, and the control
        and status registers that report on the machine itself. The registers panel of the editor
        shows each of the three as its own tab.
    </p>
    <RiscvRegistersDocumentation />
</Page>
