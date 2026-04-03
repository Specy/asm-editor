<script lang="ts">
    import RISCVSyscallExplanation from '$cmp/documentation/riscv/RISCVSyscallExplanation.svelte'
    import Page from '$cmp/shared/layout/Page.svelte'
</script>

<svelte:head>
    <title>RISC-V Syscalls</title>
    <meta
        name="description"
        content="Syscalls in RISC-V are used to make requests to the operating system. Learn how to use them and the available syscalls."
    />
    <meta
        property="og:description"
        content="Syscalls in RISC-V are used to make requests to the operating system. Learn how to use them and the available syscalls."
    />
</svelte:head>

<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>RISC-V Syscalls</h1>
    <RISCVSyscallExplanation />
</Page>
