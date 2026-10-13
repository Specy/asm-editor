<script lang="ts">
    import DefaultNavbar from '#cmp/shared/layout/DefaultNavbar.svelte'
    import Page from '#cmp/shared/layout/Page.svelte'
    import '#cmp/blog/blog.css'
    let { children }: { children: import('svelte').Snippet } = $props()
</script>

<DefaultNavbar />
<Page hasNavbar cropped="74rem" contentStyle="padding: 2.5rem 1.25rem 5rem">
    {@render children()}
</Page>
