<script lang="ts">
    import { resolve } from '$app/paths'
    import PageMeta from '#cmp/shared/layout/PageMeta.svelte'
    import { breadcrumbLd } from '#lib/seo.ts'
    import SearchLauncher from '#cmp/search/SearchLauncher.svelte'
    import NavigationLinkButton from '#cmp/shared/button/NavigationLinkButton.svelte'
    import Page from '#cmp/shared/layout/Page.svelte'
    import { instructionsDocumentationList } from '#lib/languages/M68K/M68K-documentation.ts'

    let jsonLd = $derived([
        breadcrumbLd([
            { name: 'Documentation', pathname: '/documentation' },
            { name: 'M68K', pathname: '/documentation/m68k' }
        ])
    ])
</script>

<PageMeta
    title="M68K assembly reference - instructions, addressing modes and traps | Asm Editor"
    description="Read the M68K Documentation, including all the instructions with addressing modes and the assembler features"
    type="website"
    {jsonLd}
/>

<svelte:head>
    <meta name="tags" content={instructionsDocumentationList.map((i) => i.name).join(', ')} />
</svelte:head>
<Page cropped contentStyle="padding: 1rem; gap: 1rem">
    <h1 style="margin-top: 1rem; gap: 1rem; flex-wrap: wrap" class="row">M68K Documentation</h1>
    <SearchLauncher size="full" placeholder="Search the M68K docs and courses" />
    <div class="links">
        <NavigationLinkButton href={resolve('/documentation/m68k/instruction')}>
            <div>Instructions</div>
        </NavigationLinkButton>
        <NavigationLinkButton href={resolve('/documentation/m68k/addressing-mode')}>
            <div>Addressing Modes</div>
        </NavigationLinkButton>
        <NavigationLinkButton href={resolve('/documentation/m68k/condition-codes')}>
            <div>Condition Codes</div>
        </NavigationLinkButton>
        <NavigationLinkButton href={resolve('/documentation/m68k/shift-direction')}>
            <div>Shift directions</div>
        </NavigationLinkButton>
        <NavigationLinkButton href={resolve('/documentation/m68k/traps')}>
            <div>Trap tasks</div>
        </NavigationLinkButton>
        <NavigationLinkButton href={resolve('/documentation/m68k/directive')}>
            <div>Directives</div>
        </NavigationLinkButton>
        <NavigationLinkButton href={resolve('/documentation/m68k/assembler-features')}>
            <div>Assembler Features</div>
        </NavigationLinkButton>
        <NavigationLinkButton href={resolve('/documentation/m68k/all')}>
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
