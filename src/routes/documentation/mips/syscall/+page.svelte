<script lang="ts">
    import MIPSSyscallExplanation from '$cmp/documentation/mips/MIPSSyscallExplanation.svelte'
    import Page from '$cmp/shared/layout/Page.svelte'
</script>

<svelte:head>
    <title>MIPS Syscalls</title>
    <meta
      name="description"
      content="Syscalls in MIPS are used to make requests to the operating system. Learn how to use them and the available syscalls."
    />
    <meta
      property="og:description"
      content="Syscalls in MIPS are used to make requests to the operating system. Learn how to use them and the available syscalls."
    />
</svelte:head>

<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>MIPS Syscalls</h1>
    <MIPSSyscallExplanation />
</Page>
