<script lang="ts">
    /**
     * A **Chapter** as a page of the documentation site: every entry in full, each at its anchor, so
     * a search result or a link lands on the entry itself. The URL is the one the Chapter has always
     * had ([the plan](../../../docs/design/documentation-search-plan.md), phase 2c).
     */
    import { hasCodeName, type Chapter } from '$lib/documentation/entries'
    import EntryBody from './entries/EntryBody.svelte'

    interface Props {
        chapter: Chapter
    }

    let { chapter }: Props = $props()
</script>

<div class="chapter">
    {#each chapter.entries as entry (entry.id)}
        <section class="entry" id={entry.anchor} class:prose={entry.kind === 'prose'}>
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
