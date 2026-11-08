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
            {#snippet head(card: boolean)}
                <header class:card-head={card}>
                    <h2 class="title" class:code={hasCodeName(entry)}>{entry.title}</h2>
                    {#if entry.signature}
                        <span class="signature">{entry.signature}</span>
                    {/if}
                </header>
            {/snippet}
            <!-- a prose entry is read as the page's text; every other entry is a Card, its name
                 over a rule across it, as the create and embed pages' Card headers are -->
            {#if entry.kind === 'prose'}
                <section class="entry prose reading-copy" id={entry.anchor}>
                    {@render head(false)}
                    <EntryBody {entry} />
                </section>
            {:else}
                <Card element="section" class="entry entry-card" id={entry.anchor}>
                    {@render head(true)}
                    <div class="entry-content">
                        <EntryBody {entry} />
                    </div>
                </Card>
            {/if}
        {/each}
    </div>
</Page>

<style>
    /* every table on the page at --fs-body, its headers and code cells with it, a prose entry's
       as well as a Card's (EntryBody; owner, 2026-11-08) */
    .chapter {
        --entry-table-size: var(--fs-body);
        display: flex;
        flex-direction: column;
        gap: 1.2rem;
        width: 100%;
        max-width: 60rem;
    }
    .chapter > :global(.entry) {
        display: flex;
        flex-direction: column;
        scroll-margin-top: 5.5rem;
    }
    .chapter > .prose {
        gap: 0.5rem;
        padding: 0.4rem 0;
    }
    /* a Card's text a step larger than the Documentation panel's, at --fs-body (EntryBody), and
       its name and signature over a hairline across the whole Card (owner, 2026-11-08) */
    .chapter > :global(.entry-card) {
        --entry-text-size: var(--fs-body);
    }
    .card-head {
        padding: 0.7rem 1rem 0.6rem;
        border-bottom: 1px solid var(--line);
    }
    .entry-content {
        display: flex;
        flex-direction: column;
        min-width: 0;
        padding: 0.75rem 1rem 0.9rem;
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
        font-size: var(--entry-text-size, var(--fs-small));
        color: var(--background-text-prose);
        overflow-wrap: anywhere;
    }
</style>
