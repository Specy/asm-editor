<script lang="ts">
    /**
     * A language's documentation hub, `/documentation/<language>`: its search box, the language's own
     * introduction and a button for every page in its `DOCUMENTATION_SITES` table. The introduction
     * is markdown in `DOCUMENTATION_INTROS`, which the hub's **Markdown twin** reads too.
     */
    import PageMeta from '#cmp/shared/layout/PageMeta.svelte'
    import { breadcrumbLd } from '#lib/seo.ts'
    import SearchLauncher from '#cmp/search/SearchLauncher.svelte'
    import NavigationLinkButton from '#cmp/shared/button/NavigationLinkButton.svelte'
    import Page from '#cmp/shared/layout/Page.svelte'
    import Header from '#cmp/shared/layout/Header.svelte'
    import type { DocumentationLanguage } from '#lib/search/scope.ts'
    import {
        DOCUMENTATION_INTROS,
        DOCUMENTATION_SITES,
        markdownParagraphs
    } from '#lib/documentation/site.ts'
    import InlineMarkdown from '#cmp/documentation/entries/InlineMarkdown.svelte'
    import { resolveHref } from '#lib/hrefs.ts'

    interface Props {
        language: DocumentationLanguage
        /** The page's <title>. */
        title: string
        description: string
    }

    let { language, title, description }: Props = $props()

    const site = $derived(DOCUMENTATION_SITES[language])
    const intro = $derived(markdownParagraphs(DOCUMENTATION_INTROS[language] ?? ''))
    let jsonLd = $derived([
        breadcrumbLd([
            { name: 'Documentation', pathname: '/documentation' },
            { name: site.label, pathname: `/documentation/${language}` }
        ])
    ])
</script>

<PageMeta {title} {description} type="website" {jsonLd} />
<!-- the 70rem column every documentation index has, so the titles start at one x; what is under
     the title keeps its 60rem at its left (design-system.md, D8) -->
<Page cropped="70rem" contentStyle="padding: 1rem; gap: 1rem">
    <Header>{site.label} Documentation</Header>
    <div class="search">
        <SearchLauncher size="full" placeholder={`Search the ${site.label} docs and courses`} />
    </div>
    {#each intro as paragraph, index (index)}
        <p class="intro"><InlineMarkdown source={paragraph} /></p>
    {/each}
    <div class="links">
        {#each site.pages as link (link.id)}
            <NavigationLinkButton href={resolveHref(link.href)}>
                <div>{link.title}</div>
            </NavigationLinkButton>
        {/each}
    </div>
</Page>

<style lang="scss">
    .search {
        max-width: 60rem;
    }
    .intro {
        line-height: 1.5;
        max-width: 60rem;
        margin: 0;
    }
    .intro :global(code) {
        background-color: var(--secondary);
        color: var(--accent);
    }
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
