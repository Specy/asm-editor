<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import NavigationLinkButton from '$cmp/shared/button/NavigationLinkButton.svelte'
    import DefaultNavbar from '$cmp/shared/layout/DefaultNavbar.svelte'
    import Header from '$cmp/shared/layout/Header.svelte'
    const langs = ['M68K', 'MIPS', 'RISC-V']
</script>

<DefaultNavbar />
<svelte:head>
    <title>Documentation</title>
    <meta
        name="description"
        content="All the documentations for the languages and features available in the asm-editor"
    />
    <meta
        property="og:description"
        content="All the documentations for the languages and features available in the asm-editor"
    />
    <meta property="og:title" content="Documentation" />
</svelte:head>

<Page cropped hasNavbar contentStyle="padding: 1rem">
    <Header>Languages</Header>
    <div class="langs">
        {#each langs as lang}
            <NavigationLinkButton href="/documentation/{lang.toLowerCase()}">
                <div>
                    {lang}
                </div>
            </NavigationLinkButton>
        {/each}
    </div>
</Page>

<style lang="scss">
    .langs {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr));
        gap: 1rem;
    }
    h1 {
        font-size: 1.8rem;
        font-weight: normal;
    }
</style>
