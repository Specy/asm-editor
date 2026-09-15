<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import X86SyscallDocumentation from '$cmp/documentation/x86/X86SyscallDocumentation.svelte'
</script>

<svelte:head>
    <title>x86-64 Syscalls</title>
    <meta
        name="description"
        content="The Linux syscalls an x86-64 program can make in this emulator: their numbers, the registers they read their arguments from, and what each one does."
    />
    <meta
        property="og:description"
        content="The Linux syscalls an x86-64 program can make in this emulator: their numbers, the registers they read their arguments from, and what each one does."
    />
</svelte:head>
<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>x86-64 syscalls</h1>
    <X86SyscallDocumentation />
</Page>
