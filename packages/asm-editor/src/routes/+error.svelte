<script lang="ts">
    import { page } from '$app/state'
    import { resolve } from '$app/paths'
    import ButtonLink from '#cmp/shared/button/ButtonLink.svelte'
    import DefaultNavbar from '#cmp/shared/layout/DefaultNavbar.svelte'
    import ErrorState from '#cmp/shared/layout/ErrorState.svelte'
    import Page from '#cmp/shared/layout/Page.svelte'

    //a missing page is the reader's link or typing; anything else is the site's own failure
    const missing = $derived(page.status === 404)
</script>

<svelte:head>
    <title>{missing ? 'Page not found' : 'Something went wrong'}</title>
</svelte:head>

<DefaultNavbar />
<Page hasNavbar fillsScreen>
    {#if missing}
        <ErrorState code="Error 404" title="This page doesn't exist">
            Nothing is at <code>{page.url.pathname}</code>. The link may be out of date, or the
            address mistyped.
            {#snippet actions()}
                <ButtonLink href={resolve('/')}>Home</ButtonLink>
                <ButtonLink href={resolve('/projects')} cssVar="tertiary">Your projects</ButtonLink>
                <ButtonLink href={resolve('/documentation')} cssVar="tertiary">
                    Documentation
                </ButtonLink>
            {/snippet}
        </ErrorState>
    {:else}
        <ErrorState
            code="Error {page.status}"
            title="Something went wrong"
            error={page.error?.message}
            reload
        >
            This page failed to load. Reloading it usually fixes that.
            {#snippet actions()}
                <ButtonLink href={resolve('/')} cssVar="tertiary">Home</ButtonLink>
            {/snippet}
        </ErrorState>
    {/if}
</Page>
