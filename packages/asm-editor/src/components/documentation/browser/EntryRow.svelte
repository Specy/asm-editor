<script lang="ts">
    /**
     * A Documentation entry as one compact row: its name, what follows the name and one line of
     * summary. Prose entries show their text directly, in the Workbench cut with a Show all when it
     * runs long, so the rows after it stay a glance away; clicking any other entry expands it in
     * place ([the design record](../../../../../../docs/design/documentation-search.md),
     * The Documentation panel).
     */
    import { prefersReducedMotion } from 'svelte/motion'
    import { slide } from 'svelte/transition'
    import FaChevronRight from '~icons/fa-solid/chevron-right'
    import HighlightedText from '#cmp/search/HighlightedText.svelte'
    import ClampedContent from '#cmp/shared/layout/ClampedContent.svelte'
    import { hasCodeName, type DocumentationEntry } from '#lib/documentation/entries.ts'
    import { categoryLabel } from '#lib/documentation/instructions/categories.ts'
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
        /**
         * Name an instruction's **Instruction category** beside its signature: in search results,
         * where no category heading is left to say it.
         */
        showCategory?: boolean
        /**
         * Cut a long prose entry with a Show all: in the Workbench's panel, where the rows after it
         * are what a person mostly comes for. A page shows it whole, to be read through.
         */
        clampProse?: boolean
    }

    let {
        entry,
        expanded,
        ontoggle,
        terms = [],
        disableLinks = false,
        pageLink = false,
        showCategory = false,
        clampProse = false
    }: Props = $props()

    let proseTitle = $state<HTMLElement>()
</script>

<div
    class="entry-row"
    class:expanded={expanded && entry.kind !== 'prose'}
    class:prose-row={entry.kind === 'prose'}
    data-entry-id={entry.id}
>
    {#if entry.kind === 'prose'}
        <div class="prose">
            <h4 class="prose-title" bind:this={proseTitle}>
                <HighlightedText text={entry.title} {terms} />
            </h4>
            {#if clampProse}
                <ClampedContent {expanded} {ontoggle} anchor={proseTitle}>
                    <EntryBody {entry} {disableLinks} />
                </ClampedContent>
            {:else}
                <EntryBody {entry} {disableLinks} />
            {/if}
        </div>
    {:else}
        <button type="button" class="head" aria-expanded={expanded} onclick={ontoggle}>
            <span class="chevron" aria-hidden="true"><FaChevronRight /></span>
            <span class="line">
                <span class="name" class:code={hasCodeName(entry)}
                    ><HighlightedText text={entry.title} {terms} /></span
                >
                {#if entry.signature}
                    <span class="signature">{entry.signature}</span>
                {/if}
                {#if showCategory && entry.category}
                    <span class="category">{categoryLabel(entry.category)}</span>
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
            <div
                class="body"
                transition:slide={{ duration: prefersReducedMotion.current ? 0 : 200 }}
            >
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
    {/if}
</div>

<!-- `.entry-row + .entry-row` never matches: each row is its own instance of this component, so
     the compiler drops it and no divider renders. Kept until it is decided whether rows get one -->
<!-- svelte-ignore css_unused_selector -->
<style>
    .entry-row {
        border-radius: 0.45rem;
        min-width: 0;
    }
    .entry-row:not(.expanded):not(.prose-row) {
        content-visibility: auto;
        contain-intrinsic-block-size: auto 3.1rem;
        contain: content;
    }
    .entry-row.prose-row {
        content-visibility: auto;
        contain-intrinsic-block-size: auto 6rem;
    }
    @media print {
        .entry-row:not(.expanded):not(.prose-row),
        .entry-row.prose-row {
            content-visibility: visible;
            contain: none;
        }
    }
    .entry-row + .entry-row {
        border-top: 1px solid var(--wb-line, color-mix(in srgb, var(--tertiary) 70%, transparent));
    }
    .entry-row.expanded {
        background-color: color-mix(in srgb, var(--tertiary) 45%, transparent);
    }
    .prose {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        padding: 0.5rem;
        min-width: 0;
        overflow-wrap: anywhere;
    }
    .prose-title {
        margin: 0;
        font-size: inherit;
        font-weight: 600;
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
    .category {
        flex: none;
        margin-left: auto;
        font-size: 0.75rem;
        color: var(--background-text-muted);
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
