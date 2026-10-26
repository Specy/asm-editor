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
<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>{heading}</h1>
    <div class="chapter">
        {#each chapter.entries as entry (entry.id)}
            <section
                class="entry"
                id={entry.anchor}
                class:prose={entry.kind === 'prose'}
                class:reading-copy={entry.kind === 'prose'}
            >
                <header>
                    <h2 class="title" class:code={hasCodeName(entry)}>{entry.title}</h2>
                    {#if entry.signature}
                        <span class="signature">{entry.signature}</span>
                    {/if}
                </header>
                <EntryBody {entry} />
            </section>
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
    .entry {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 0.9rem 1rem;
        border-radius: 0.6rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
        scroll-margin-top: 5.5rem;
    }
    .entry.prose {
        background-color: transparent;
        color: inherit;
        padding: 0.4rem 0;
    }
    .entry:target {
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
        font-size: 1.2rem;
    }
    .prose .title {
        font-size: 1.35rem;
    }
    .code {
        font-family: 'Fira Code', monospace;
    }
    .signature {
        font-family: 'Fira Code', monospace;
        font-size: 0.9rem;
        color: var(--background-text-muted);
        overflow-wrap: anywhere;
    }
</style>
