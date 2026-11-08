<script lang="ts">
    /**
     * A **Chapter** as a page of the documentation site: its meta and schema.org article, its
     * heading, and every entry in full, each at its anchor, so a search result or a link lands on
     * the entry itself. The URL is the one the Chapter has always had
     * ([the plan](../../../../../docs/design/documentation-search-plan.md), phase 2c). The Chapter's
     * route passes it in, so no page loads another language's Documentation.
     */
    import { page } from '$app/state'
    import PageMeta from '#cmp/shared/layout/PageMeta.svelte'
    import Page from '#cmp/shared/layout/Page.svelte'
    import Header from '#cmp/shared/layout/Header.svelte'
    import Card from '#cmp/shared/layout/Card.svelte'
    import { breadcrumbLd, documentationArticleLd } from '#lib/seo.ts'
    import { DOCUMENTATION_SITES } from '#lib/documentation/site.ts'
    import { hasCodeName, type Chapter } from '#lib/documentation/entries.ts'
    import EntryBody from './entries/EntryBody.svelte'

    interface Props {
        chapter: Chapter
        /** The page's <h1>, also its breadcrumb and its article's headline. */
        heading: string
        /** The page's <title>. */
        title: string
        description: string
    }

    let { chapter, heading, title, description }: Props = $props()

    let jsonLd = $derived.by(() => {
        const label = DOCUMENTATION_SITES[chapter.language].label
        const root = `/documentation/${chapter.language}`
        return [
            breadcrumbLd([
                { name: 'Documentation', pathname: '/documentation' },
                { name: label, pathname: root },
                { name: heading, pathname: page.url.pathname }
            ]),
            documentationArticleLd({
                headline: heading,
                description,
                pathname: page.url.pathname,
                section: { name: `${label} assembly reference`, pathname: root }
            })
        ]
    })
</script>

<PageMeta {title} {description} type="article" {jsonLd} />
<!-- the 70rem column every documentation index has, so the titles start at one x; the entries
     keep their 60rem at its left (design-system.md, D8) -->
<Page cropped="70rem" contentStyle="padding: 1rem; gap: 1rem;">
    <Header>{heading}</Header>
    <div class="chapter">
        {#each chapter.entries as entry (entry.id)}
            {#snippet content()}
                <header>
                    <h2 class="title" class:code={hasCodeName(entry)}>{entry.title}</h2>
                    {#if entry.signature}
                        <span class="signature">{entry.signature}</span>
                    {/if}
                </header>
                <EntryBody {entry} />
            {/snippet}
            <!-- a prose entry is read as the page's text; every other entry is a Card -->
            {#if entry.kind === 'prose'}
                <section class="entry prose reading-copy" id={entry.anchor}>
                    {@render content()}
                </section>
            {:else}
                <Card element="section" class="entry" id={entry.anchor}>
                    {@render content()}
                </Card>
            {/if}
        {/each}
    </div>
</Page>

<style>
    .chapter {
        display: flex;
        flex-direction: column;
        gap: 1.2rem;
        width: 100%;
        max-width: 60rem;
    }
    .chapter > :global(.entry) {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 0.9rem 1rem;
        scroll-margin-top: 5.5rem;
    }
    .chapter > .prose {
        padding: 0.4rem 0;
    }
    .chapter > :global(.entry:target) {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
    }
    header {
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: 0.3rem 0.8rem;
    }
    .title {
        margin: 0;
        font-size: var(--fs-lead);
    }
    .prose .title {
        font-size: var(--fs-h3);
    }
    .code {
        font-family: var(--font-mono);
    }
    .signature {
        font-family: var(--font-mono);
        font-size: var(--fs-small);
        color: var(--background-text-prose);
        overflow-wrap: anywhere;
    }
</style>
