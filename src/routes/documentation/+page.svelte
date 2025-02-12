<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import NavigationLinkButton from '$cmp/shared/button/NavigationLinkButton.svelte'
    import { capitalize } from '$lib/utils'
    import DefaultNavbar from '$cmp/shared/layout/DefaultNavbar.svelte'
    const langs = ['m68k', 'mips']
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
    <meta name="og:title" content="Documentation" />
</svelte:head>

<Page cropped contentStyle="margin-top: 4rem; gap: 1rem; padding: 1rem">
    <h1>Languages</h1>
    <div class="langs">
        {#each langs as lang}
            <NavigationLinkButton href="/documentation/{lang}">
                <div>
                    {capitalize(lang)}
                </div>
            </NavigationLinkButton>
        {/each}
    </div>
</Page>

<style lang="scss">
    .langs {
        display: grid;
        grid-template-columns: repeat(2, minmax(10rem, 1fr));
        gap: 1rem;
        margin-left: 1rem;
    }
    h1 {
        font-size: 1.8rem;
        font-weight: normal;
    }
</style>
