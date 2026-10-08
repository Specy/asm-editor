<script lang="ts">
    import { resolve } from '$app/paths'
    import SearchLauncher from '$cmp/search/SearchLauncher.svelte'
    import NavigationLinkButton from '$cmp/shared/button/NavigationLinkButton.svelte'
    import Page from '$cmp/shared/layout/Page.svelte'
</script>

<svelte:head>
    <title>RISC-V Documentation</title>
    <meta
        name="description"
        content="RISC-V assembly reference for RV32 and RV64 instructions, directives, simulator services, registers, and C/C++ programs."
    />
    <meta
        property="og:description"
        content="RISC-V assembly reference for RV32 and RV64 instructions, directives, simulator services, registers, and C/C++ programs."
    />
</svelte:head>
<Page cropped contentStyle="padding: 1rem; gap: 1rem">
    <h1 style="margin-top: 1rem; gap: 1rem; flex-wrap: wrap" class="row">RISC-V Documentation</h1>
    <SearchLauncher size="full" placeholder="Search the RISC-V docs and courses" />
    <p>
        This reference covers RV32 and RV64 assembly for the RARS simulator. For a service call, put
        its number in <code>a7</code> and use the listed registers for its arguments and result; see
        <a href={resolve('/documentation/risc-v/syscall', {})}>Syscalls</a>.
    </p>
    <div class="links">
        <NavigationLinkButton href="/documentation/risc-v/directive">
            <div>Directives</div>
        </NavigationLinkButton>
        <NavigationLinkButton href="/documentation/risc-v/instruction">
            <div>Instructions</div>
        </NavigationLinkButton>
        <NavigationLinkButton href="/documentation/risc-v/syscall">
            <div>Syscalls</div>
        </NavigationLinkButton>
        <NavigationLinkButton href="/documentation/risc-v/registers">
            <div>Registers</div>
        </NavigationLinkButton>
        <NavigationLinkButton href="/documentation/risc-v/screen">
            <div>Screen and I/O</div>
        </NavigationLinkButton>
        <NavigationLinkButton href="/documentation/risc-v/using-c">
            <div>Using C and C++</div>
        </NavigationLinkButton>
        <NavigationLinkButton href="/documentation/risc-v/runtime-library">
            <div>Runtime library</div>
        </NavigationLinkButton>
        <NavigationLinkButton href="/documentation/risc-v/all">
            <div>Complete Documentation</div>
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
