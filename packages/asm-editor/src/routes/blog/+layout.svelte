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
    <!-- The lists share the column and gutter of /documentation and /learn/courses, so moving
         between them keeps the title in place; blog.css's .blog-intro does the top spacing. -->
    <Page
        hasNavbar
        cropped={isArticle ? false : '70rem'}
        contentStyle={isArticle ? 'padding: 2.5rem 0 5rem' : 'padding: 1rem 1rem 5rem'}
    >
        {@render children()}
    </Page>
{/key}
