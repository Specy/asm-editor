<script lang="ts">
    import { page } from '$app/state'
    import DefaultNavbar from '#cmp/shared/layout/DefaultNavbar.svelte'
    import Page from '#cmp/shared/layout/Page.svelte'
    import '#cmp/blog/blog.css'
    let { children }: { children: import('svelte').Snippet } = $props()
    const isArticle = $derived(page.route.id === '/blog/posts/[slug]')
</script>

<DefaultNavbar />
{#key page.url.pathname}
    <Page
        hasNavbar
        cropped={isArticle ? false : '74rem'}
        contentStyle={`padding: 2.5rem ${isArticle ? '0' : '1.25rem'} 5rem`}
    >
        {@render children()}
    </Page>
{/key}
