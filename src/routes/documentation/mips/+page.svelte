<script lang="ts">
    import NavigationLinkButton from '$cmp/shared/button/NavigationLinkButton.svelte'
    import Page from '$cmp/shared/layout/Page.svelte'
</script>

<svelte:head>
    <title>MIPS Documentation</title>
    <meta
        name="description"
        content="Read the MIPS Documentation, including all the instructions with addressing modes and the assembler features"
    />
    <meta
        property="og:description"
        content="Read the MIPS Documentation, including all the instructions with addressing modes and the assembler features"
    />
</svelte:head>
<Page cropped contentStyle="padding: 1rem; gap: 1rem">
    <h1 style="margin-top: 1rem; gap: 1rem; flex-wrap: wrap" class="row">MIPS Documentation</h1>
    <div class="links">
        <NavigationLinkButton href="/documentation/mips/directive">
            <div>Directives</div>
        </NavigationLinkButton>
        <NavigationLinkButton href="/documentation/mips/instruction">
            <div>Instructions</div>
        </NavigationLinkButton>
        <NavigationLinkButton href="/documentation/mips/syscall">
            <div>Syscalls</div>
        </NavigationLinkButton>
    </div>
</Page>

<style lang="scss">
    .links {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        max-width: 60rem;
        gap: 0.8rem;
    }
    @media (max-width: 900px) {
        .links {
            grid-template-columns: repeat(2, 1fr);
        }
    }
    @media (max-width: 400px) {
        .links {
            grid-template-columns: repeat(1, 1fr);
        }
    }
</style>
