<script lang="ts">
    /**
     * A Documentation entry as one compact row: its name, what follows the name and one line of
     * summary. Clicking it expands the entry in place ([the design record](../../../../docs/design/documentation-search.md),
     * The Documentation panel).
     */
    import { prefersReducedMotion } from 'svelte/motion'
    import { slide } from 'svelte/transition'
    import FaChevronRight from '~icons/fa-solid/chevron-right'
    import HighlightedText from '$cmp/search/HighlightedText.svelte'
    import { hasCodeName, type DocumentationEntry } from '$lib/documentation/entries'
    import EntryBody from '../entries/EntryBody.svelte'

    interface Props {
        entry: DocumentationEntry
        expanded: boolean
        ontoggle: () => void
        /** Words of the query, marked in the name and the summary. */
        terms?: string[]
        disableLinks?: boolean
        /** Shown under the expanded entry: a link to its own page. */
        pageLink?: boolean
    }

    let {
        entry,
        expanded,
        ontoggle,
        terms = [],
        disableLinks = false,
        pageLink = false
    }: Props = $props()
</script>

<div class="entry-row" class:expanded data-entry-id={entry.id}>
    <button type="button" class="head" aria-expanded={expanded} onclick={ontoggle}>
        <span class="chevron" aria-hidden="true"><FaChevronRight /></span>
        <span class="line">
            <span class="name" class:code={hasCodeName(entry)}
                ><HighlightedText text={entry.title} {terms} /></span
            >
            {#if entry.signature}
                <span class="signature">{entry.signature}</span>
            {/if}
        </span>
        {#if !expanded}
            <span
                class="summary"
                transition:slide={{ duration: prefersReducedMotion.current ? 0 : 200 }}
                ><HighlightedText text={entry.summary} {terms} /></span
            >
        {/if}
    </button>
    {#if expanded}
        <div class="body" transition:slide={{ duration: prefersReducedMotion.current ? 0 : 200 }}>
            <EntryBody {entry} {disableLinks} />
            {#if pageLink}
                <a class="page-link" href={entry.href}>
                    {entry.kind === 'instruction'
                        ? 'Open its page, with an example to run'
                        : 'Open its page'}
                </a>
            {/if}
        </div>
    {/if}
</div>

<style>
    .entry-row {
        border-radius: 0.45rem;
        min-width: 0;
    }
    .entry-row + .entry-row {
        border-top: 1px solid var(--wb-line, color-mix(in srgb, var(--tertiary) 70%, transparent));
    }
    .entry-row.expanded {
        background-color: color-mix(in srgb, var(--tertiary) 45%, transparent);
    }
    .head {
        display: grid;
        grid-template-columns: 0.8rem 1fr;
        grid-template-rows: auto auto;
        column-gap: 0.45rem;
        width: 100%;
        padding: 0.35rem 0.5rem;
        border: none;
        border-radius: 0.45rem;
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
        min-width: 0;
    }
    .head:hover {
        background-color: color-mix(in srgb, var(--tertiary) 55%, transparent);
    }
    .head:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: -2px;
    }
    .chevron {
        grid-row: 1;
        align-self: center;
        display: flex;
        width: 0.6rem;
        height: 0.6rem;
        opacity: 0.55;
        transition: transform 0.15s ease;
    }
    .expanded .chevron {
        transform: rotate(90deg);
    }
    .line {
        grid-column: 2;
        display: flex;
        align-items: baseline;
        gap: 0.55rem;
        min-width: 0;
    }
    .name {
        flex: none;
        font-weight: 600;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .code {
        font-family: 'Fira Code', monospace;
        font-size: 0.95em;
    }
    .signature {
        flex: 1;
        min-width: 0;
        font-family: 'Fira Code', monospace;
        font-size: 0.8rem;
        color: var(--background-text-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .summary {
        display: block;
        grid-column: 2;
        grid-row: 2;
        margin-top: 0.25rem;
        font-size: 0.85rem;
        color: var(--background-text-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
    }
    .body {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 0.6rem 0.7rem 0.7rem 1.75rem;
        min-width: 0;
    }
    .page-link {
        align-self: flex-start;
        font-size: 0.85rem;
        color: var(--accent);
        text-decoration: underline;
    }
    @media (prefers-reduced-motion: reduce) {
        .chevron {
            transition: none;
        }
    }
</style>
