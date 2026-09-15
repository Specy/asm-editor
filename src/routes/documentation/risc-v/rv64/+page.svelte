<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import RISCV64Documentation from '$cmp/documentation/riscv/RISCV64Documentation.svelte'
</script>

<svelte:head>
    <title>RISC-V 64 bit known issues</title>
    <meta
        name="description"
        content="The immediate shift instructions slli, srli and srai give the wrong answer for amounts of 31 or less in the 64 bit emulator, which also breaks li of a wide constant. What goes wrong and how to work around it."
    />
    <meta
        property="og:description"
        content="The immediate shift instructions slli, srli and srai give the wrong answer for amounts of 31 or less in the 64 bit emulator, which also breaks li of a wide constant. What goes wrong and how to work around it."
    />
</svelte:head>
<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>64 bit known issues</h1>
    <RISCV64Documentation />
</Page>
