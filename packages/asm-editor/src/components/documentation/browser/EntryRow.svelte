<script lang="ts">
    /**
     * A Documentation entry as one compact row: its name, what follows the name and one line of
     * summary. Prose entries show their text directly, in the Workbench cut with a Show all when it
     * runs long, so the rows after it stay a glance away; clicking any other entry expands it in
     * place ([the design record](../../../../../../docs/design/documentation-search.md),
     * The Documentation panel).
     */
    import { DUR_BASE, motion } from '#src/styles/motion.ts'
    import { slide } from 'svelte/transition'
    import FaChevronRight from '~icons/fa-solid/chevron-right'
    import HighlightedText from '#cmp/search/HighlightedText.svelte'
    import ClampedContent from '#cmp/shared/layout/ClampedContent.svelte'
    import { hasCodeName, type DocumentationEntry } from '#lib/documentation/entries.ts'
    import { categoryLabel } from '#lib/documentation/instructions/categories.ts'
    import { resolveHref } from '#lib/hrefs.ts'
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
        /**
         * In the Workbench's Documentation panel: an expanded entry reads a step larger than the
         * rows round it, its toggles are drawn as folding headers, and its name stays pinned under
         * the pinned headings while its body scrolls (owner, 2026-11-08). `/all` keeps its look.
         */
        panel?: boolean
    }

    let {
        entry,
        expanded,
        ontoggle,
        terms = [],
        disableLinks = false,
        pageLink = false,
        showCategory = false,
        clampProse = false,
        panel = false
    }: Props = $props()

    let proseTitle = $state<HTMLElement>()
</script>

<div
    class="entry-row"
    class:expanded={expanded && entry.kind !== 'prose'}
    class:prose-row={entry.kind === 'prose'}
    class:in-panel={panel}
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
                <span class="name ellipsis" class:code={hasCodeName(entry)}
                    ><HighlightedText text={entry.title} {terms} /></span
                >
                {#if entry.signature}
                    <span class="signature ellipsis">{entry.signature}</span>
                {/if}
                {#if showCategory && entry.category}
                    <span class="category">{categoryLabel(entry.category)}</span>
                {/if}
            </span>
            {#if !expanded}
                <span class="summary ellipsis" transition:slide={{ duration: motion(DUR_BASE) }}
                    ><HighlightedText text={entry.summary} {terms} /></span
                >
            {/if}
        </button>
        {#if expanded}
            <div class="body" transition:slide={{ duration: motion(DUR_BASE) }}>
                <EntryBody {entry} {disableLinks} foldingToggles={panel} />
                {#if pageLink}
                    <a class="page-link" href={resolveHref(entry.href)}>
                        {entry.kind === 'instruction'
                            ? 'Open its page, with an example to run'
                            : 'Open its page'}
                    </a>
                {/if}
            </div>
        {/if}
    {/if}
</div>

<style lang="scss">
    @use '../../../styles/radius.scss' as *;

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
        background-color: var(--hover-bg);
    }
    .head:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: -2px;
    }
    .chevron {
        grid-row: 1;
        align-self: center;
        display: flex;
        width: var(--fs-micro);
        height: var(--fs-micro);
        opacity: 0.55;
        transition: transform var(--dur-base) ease;
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
    }
    .code {
        font-family: var(--font-mono);
        font-size: 0.95em;
    }
    .signature {
        flex: 1;
        min-width: 0;
        font-family: var(--font-mono);
        font-size: var(--fs-small);
        color: var(--background-text-prose);
    }
    .category {
        flex: none;
        margin-left: auto;
        font-size: var(--fs-caption);
        color: var(--background-text-prose);
        white-space: nowrap;
    }
    .summary {
        display: block;
        grid-column: 2;
        grid-row: 2;
        margin-top: 0.25rem;
        font-size: var(--fs-small);
        color: var(--background-text-prose);
        min-width: 0;
    }
    .body {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 0.6rem 0.7rem 0.7rem 1.75rem;
        min-width: 0;
    }
    /* In the Workbench's panel an expanded entry's text reads a step up the type scale (D11) from
       the panel's dense rows, --fs-small to --fs-body and --fs-caption to --fs-small, in every part
       that reads these sizes (EntryBody, InstructionDocumentView, OperandLegend, FormPatternRow);
       its code samples are at the editor's size already, which its syntax lines now match (owner,
       2026-11-08). `/all` and the Chapter pages set their own */
    .in-panel > .body {
        --entry-text-size: var(--fs-body);
        --entry-caption-size: var(--fs-small);
        /* half the room at its sides of the body on a page, so the text and the code get more of
           the panel's width (owner, 2026-11-09) */
        padding-inline: 0.875rem 0.35rem;
    }
    /* An expanded entry's name stays pinned while its body scrolls under it: just under the pinned
       Chapter and category headings (`--entry-head-top`, DocumentationBrowser), opaque in the row's
       own colour over what the row sits on (`--entry-row-under`), ruled off from its body, and
       pushed up by the next expanded entry's name as its own row ends (owner, 2026-11-08). Its top
       corners are the row's; past their curve what the row sits on is painted, so the body going by
       under the pinned name never shows round them, as on a Chapter's heading (O-54) */
    .in-panel.expanded > .head {
        --row-under: var(--entry-row-under, var(--background));
        position: sticky;
        top: var(--entry-head-top, 0px);
        z-index: 1;
        background-color: color-mix(in srgb, var(--tertiary) 45%, var(--row-under));
        border-radius: 0.45rem 0.45rem 0 0;
        box-shadow: inset 0 -1px 0
            var(--wb-line, color-mix(in srgb, var(--tertiary) 70%, transparent));
        @include outside-corners(0.45rem, var(--row-under));
    }
    /* the hover tint over that colour, which stays opaque (D4) */
    .in-panel.expanded > .head:hover {
        background-image: linear-gradient(var(--hover-bg), var(--hover-bg));
    }
    .page-link {
        align-self: flex-start;
        font-size: var(--fs-small);
        color: var(--accent);
        text-decoration: underline;
    }
</style>
