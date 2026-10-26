<script lang="ts">
    /**
     * A language's documentation hub, `/documentation/<language>`: its search box, the language's own
     * introduction and a button for every page in its `DOCUMENTATION_SITES` table.
     */
    import type { Snippet } from 'svelte'
    import PageMeta from '#cmp/shared/layout/PageMeta.svelte'
    import { breadcrumbLd } from '#lib/seo.ts'
    import SearchLauncher from '#cmp/search/SearchLauncher.svelte'
    import NavigationLinkButton from '#cmp/shared/button/NavigationLinkButton.svelte'
    import Page from '#cmp/shared/layout/Page.svelte'
    import type { DocumentationLanguage } from '#lib/search/scope.ts'
    import { DOCUMENTATION_SITES } from '#lib/documentation/site.ts'
    import { resolveHref } from '#lib/hrefs.ts'

    interface Props {
        language: DocumentationLanguage
        /** The page's <title>. */
        title: string
        description: string
        /** What comes between the search box and the buttons, styled by the page that writes it. */
        intro?: Snippet
    }

    let { language, title, description, intro }: Props = $props()

    const site = $derived(DOCUMENTATION_SITES[language])
    let jsonLd = $derived([
        breadcrumbLd([
            { name: 'Documentation', pathname: '/documentation' },
            { name: site.label, pathname: `/documentation/${language}` }
        ])
    ])
</script>

<PageMeta {title} {description} type="website" {jsonLd} />
<Page cropped contentStyle="padding: 1rem; gap: 1rem">
    <h1 style="margin-top: 1rem; gap: 1rem; flex-wrap: wrap" class="row">
        {site.label} Documentation
    </h1>
    <SearchLauncher size="full" placeholder={`Search the ${site.label} docs and courses`} />
    {@render intro?.()}
    <div class="links">
        {#each site.pages as link (link.id)}
            <NavigationLinkButton href={resolveHref(link.href)}>
                <div>{link.title}</div>
            </NavigationLinkButton>
        {/each}
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
