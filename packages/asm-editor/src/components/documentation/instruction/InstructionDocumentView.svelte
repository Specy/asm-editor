<script lang="ts" module>
    import type { InstructionTag } from '#lib/documentation/instructions/categories.ts'

    /** A section's heading: its tags, as plural nouns where they name forms. */
    const SECTION_LABELS: Record<InstructionTag, string> = {
        pseudo: 'Pseudo-instructions',
        'rv64-only': 'RV64 only',
        undocumented: 'Undocumented',
        privileged: 'Privileged',
        '68010': '68010 and later',
        '68020': '68020 only'
    }

    export function sectionHeading(tags: readonly InstructionTag[]): string {
        return tags.length === 0 ? 'Forms' : tags.map((tag) => SECTION_LABELS[tag]).join(' · ')
    }

    /** How many rows the panel shows of a section before "Show all". */
    export const PANEL_ROWS = 6

    /** A longer legend starts closed in the panel; a symbol's tooltip already says what it is. */
    const PANEL_LEGEND_LINES = 4
</script>

<script lang="ts">
    /**
     * Every language's instruction, in one order: header, flags, Forms, Operands, description,
     * example ([the design record](../../../../../../docs/design/instruction-layout.md), decisions 1
     * and 8). The page shows it whole; the Workbench's panel (`density="panel"`) leaves the name to
     * its row, puts each fact line under its syntax and cuts a long section by count (decision 9).
     */
    import { tick, type Snippet } from 'svelte'
    import FaExternalLinkAlt from '~icons/fa-solid/external-link-alt'
    import type { InstructionLesson } from '#lib/content/lectureInstructions.ts'
    import MarkdownRenderer from '#cmp/shared/markdown/MarkdownRenderer.svelte'
    import InstructionTagBadge from '#cmp/documentation/entries/InstructionTagBadge.svelte'
    import { codeBlockStyle } from '#lib/content/codeBlockStyle.ts'
    import type { AvailableLanguages } from '#lib/Project.svelte.ts'
    import InlineMarkdown from '#cmp/documentation/entries/InlineMarkdown.svelte'
    import { plainText } from '#lib/documentation/entries.ts'
    import {
        patternOpens,
        type FormPattern,
        type InstructionDocument
    } from '#lib/documentation/instructions/document.ts'
    import FlagStrip from './FlagStrip.svelte'
    import FormPatternRow from './FormPatternRow.svelte'
    import InstructionLessons from './InstructionLessons.svelte'
    import OperandLegend, { symbolSlug } from './OperandLegend.svelte'

    interface Props {
        document: InstructionDocument
        density?: 'page' | 'panel'
        disableLinks?: boolean
        /** The page's runnable example, after everything else. */
        example?: Snippet
        /** How the forms of an opened row are highlighted. */
        language?: AvailableLanguages
        /** The mnemonic's other spellings, whose own pages point readers and crawlers here. */
        aliases?: string[]
        /** The Lectures whose code uses it, the header's last line on the page. */
        lessons?: readonly InstructionLesson[]
    }

    let {
        document,
        density = 'page',
        disableLinks = false,
        example,
        language,
        aliases = [],
        lessons = []
    }: Props = $props()

    // the editor's colours and font for the highlighted forms, as code samples take them
    const codeStyle = $derived(codeBlockStyle())

    let panel = $derived(density === 'panel')
    // a long name that only spells the mnemonic says nothing the name does not
    let showLongName = $derived(document.longName.toLowerCase() !== document.name.toLowerCase())
    let idPrefix = $derived(`operands-${document.name.replace(/[^a-z0-9]/gi, '_')}`)
    let marked = $state<string | undefined>()
    let showAll = $state<Record<number, boolean>>({})
    let legendOpen = $state(false)

    //what the reader did on one instruction is not done on the next, which a route shows in this
    //same view: nothing marked, no section shown whole, the legend closed
    $effect(() => {
        void document.name
        marked = undefined
        showAll = {}
        legendOpen = false
    })

    let meanings = $derived(
        new Map(document.operands.map((operand) => [operand.symbol, plainText(operand.meaning)]))
    )
    let flagOrder = $derived(document.flags?.order ?? [])

    /**
     * A symbol tapped in a row marks its line in the legend and opens a collapsed legend to show
     * it, every tap, though the reader closed it since. The line is scrolled to once the legend is
     * drawn open: closed, it has no box to scroll to.
     */
    async function onsymbol(symbol: string) {
        marked = symbol
        legendOpen = true
        await tick()
        const line = globalThis.document?.getElementById(`${idPrefix}-${symbolSlug(symbol)}`)
        line?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }

    function rowCount(section: InstructionDocument['sections'][number]): number {
        return section.groups.reduce((count, group) => count + group.patterns.length, 0)
    }

    type Card = { note?: string; rows: { pattern: FormPattern; note?: string }[] }

    /**
     * The boxes a section is drawn in: a note shared by several rows heads their box, and rows
     * that are alone with their note, or with none (most of the Z80's), share one box with any
     * note under its row, rather than a box apiece.
     */
    function cards(groups: { note?: string; patterns: FormPattern[] }[]): Card[] {
        const out: Card[] = []
        let singles: Card | undefined
        for (const group of groups) {
            if (group.patterns.length === 1) {
                singles ??= { rows: [] }
                singles.rows.push({ pattern: group.patterns[0], note: group.note })
                continue
            }
            if (singles) out.push(singles)
            singles = undefined
            out.push({ note: group.note, rows: group.patterns.map((pattern) => ({ pattern })) })
        }
        if (singles) out.push(singles)
        return out
    }

    /** The groups of a section, cut to the panel's rows unless the reader asked for all of them. */
    function visibleGroups(section: InstructionDocument['sections'][number], index: number) {
        if (!panel || showAll[index] || rowCount(section) <= PANEL_ROWS) return section.groups
        let left = PANEL_ROWS
        const groups: { note?: string; patterns: FormPattern[] }[] = []
        for (const group of section.groups) {
            if (left <= 0) break
            groups.push({ note: group.note, patterns: group.patterns.slice(0, left) })
            left -= group.patterns.length
        }
        return groups
    }
</script>

<!--
    a route shows the next instruction in this same view, which starts it afresh: no row left open,
    no Lecture list or section left expanded
-->
{#key document.name}
    <article class="instruction-document" class:panel style={codeStyle}>
        <header class="header">
            <div class="title-line">
                {#if !panel}
                    <h1 class="name">{document.name}</h1>
                {/if}
                {#if showLongName || document.tags.length > 0}
                    <p class="identity">
                        {#if showLongName}<span class="long-name">{document.longName}</span>{/if}
                        {#if document.tags.length > 0}
                            <span class="instruction-tags">
                                {#each document.tags as tag (tag)}
                                    <InstructionTagBadge {tag} />
                                {/each}
                            </span>
                        {/if}
                    </p>
                {/if}
            </div>
            <p class="summary">{document.summary}</p>
            {#if document.headerFacts.length > 0}
                <p class="header-facts">
                    {#each document.headerFacts as fact, index (index)}
                        {#if index > 0}<span class="fact-dot" aria-hidden="true">·</span
                            >{/if}<InlineMarkdown source={fact} />
                    {/each}
                </p>
            {/if}
            {#if aliases.length > 0}
                <p class="header-facts">
                    <InlineMarkdown
                        source={`Also written as: ${aliases.map((alias) => `\`${alias}\``).join(', ')}`}
                    />
                </p>
            {/if}
            {#if document.reference && !disableLinks}
                <!-- eslint-disable svelte/no-navigation-without-resolve -- a page on another site, which resolve() has no part in -->
                <p class="header-facts">
                    <a
                        class="reference"
                        href={document.reference.href}
                        target="_blank"
                        rel="noreferrer"
                    >
                        {document.reference.label}
                        <span class="external" aria-hidden="true"><FaExternalLinkAlt /></span>
                    </a>
                </p>
                <!-- eslint-enable svelte/no-navigation-without-resolve -->
            {/if}
            {#if lessons.length > 0 && language}
                <InstructionLessons {lessons} {language} />
            {/if}
        </header>

        {#if document.flags?.marks}
            <FlagStrip
                order={document.flags.order}
                marks={document.flags.marks}
                reads={document.flags.reads}
                notes={document.flags.notes}
                note={document.flags.note}
                varies={document.flags.varies}
            />
        {/if}

        <div class="sections">
            {#each document.sections as section, index (index)}
                {@const rows = rowCount(section)}
                {#snippet body()}
                    {#if section.explanation}
                        <p class="explanation"><InlineMarkdown source={section.explanation} /></p>
                    {/if}
                    {#each cards(visibleGroups(section, index)) as card, cardIndex (cardIndex)}
                        <div class="group">
                            {#if card.note}
                                <p class="note">
                                    <span class="note-text"
                                        ><InlineMarkdown source={card.note} /></span
                                    >
                                </p>
                            {/if}
                            <ul class="rows">
                                {#each card.rows as row, rowIndex (rowIndex)}
                                    <FormPatternRow
                                        pattern={row.pattern}
                                        note={row.note}
                                        meaningOf={(symbol) => meanings.get(symbol)}
                                        {onsymbol}
                                        {flagOrder}
                                        compact={panel}
                                        {language}
                                        aligned={card.rows.some((other) =>
                                            patternOpens(other.pattern)
                                        )}
                                    />
                                {/each}
                            </ul>
                        </div>
                    {/each}
                    {#if panel && !showAll[index] && rows > PANEL_ROWS}
                        <button
                            type="button"
                            class="show-all"
                            onclick={() => (showAll = { ...showAll, [index]: true })}
                        >
                            Show all {rows}
                        </button>
                    {/if}
                {/snippet}
                {#if section.collapsed}
                    <details class="section">
                        <summary
                            ><span class="heading">{sectionHeading(section.tags)}</span>
                            <span class="count">{rows} {rows === 1 ? 'row' : 'rows'}</span></summary
                        >
                        {@render body()}
                    </details>
                {:else}
                    <section class="section">
                        <h2 class="heading">{sectionHeading(section.tags)}</h2>
                        {@render body()}
                    </section>
                {/if}
            {/each}
        </div>

        {#if document.operands.length > 0}
            <OperandLegend
                operands={document.operands}
                {marked}
                bind:open={legendOpen}
                {idPrefix}
                {disableLinks}
                compact={panel}
                collapsible={panel && document.operands.length > PANEL_LEGEND_LINES}
            />
        {/if}

        {#if document.description}
            <div class="description" class:reading-copy={!panel}>
                <MarkdownRenderer
                    source={document.description}
                    style="font-size: var(--instruction-prose-size)"
                    centered={false}
                    simpleCode={panel}
                    linksInNewTab={panel}
                    {disableLinks}
                />
            </div>
        {/if}

        {#if example}
            {@render example()}
        {/if}
    </article>
{/key}

<style>
    .instruction-document {
        --doc-rule: color-mix(in srgb, var(--tertiary) 85%, transparent);
        --instruction-prose-size: var(--content-prose-size, 1.1rem);
        display: flex;
        flex-direction: column;
        gap: 1.4rem;
        min-width: 0;
    }
    .panel {
        --instruction-prose-size: 0.92rem;
        gap: 0.8rem;
    }
    .header {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        min-width: 0;
    }
    .title-line {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        column-gap: 1.2rem;
        row-gap: 0.2rem;
        min-width: 0;
    }
    .name {
        margin: 0;
        font-size: 3.5rem;
        line-height: 1.05;
        font-weight: 600;
        color: var(--accent);
        overflow-wrap: anywhere;
    }
    .identity {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.3rem 0.7rem;
        margin: 0;
        min-width: 0;
        font-size: 1.3rem;
        color: var(--background-text-muted);
        opacity: 0.85;
    }
    .panel .identity {
        font-size: 0.95rem;
    }
    .long-name {
        font-weight: normal;
    }
    .instruction-tags {
        display: inline-flex;
        gap: 0.3rem;
    }
    .summary {
        margin: 0;
        max-width: 80ch;
        font-size: var(--instruction-prose-size);
        line-height: 1.5;
    }
    .header-facts {
        max-width: 80ch;
        margin: 0;
        font-size: 0.9rem;
        color: var(--background-text-muted);
    }
    /* its own spaces, which Svelte would trim from the span's text */
    .fact-dot {
        margin: 0 0.3em;
    }
    /* a page on another site: the link colour and underline, and the icon for leaving */
    .reference {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        color: var(--accent);
        text-decoration: underline;
        text-underline-offset: 0.15em;
    }
    .reference:hover {
        text-decoration-thickness: 2px;
    }
    .external {
        display: flex;
        width: 0.7rem;
        height: 0.7rem;
    }
    .sections {
        display: flex;
        flex-direction: column;
        gap: 1.1rem;
        min-width: 0;
    }
    .panel .sections {
        gap: 0.7rem;
    }
    .section {
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
        min-width: 0;
        max-width: 64rem;
    }
    .heading {
        margin: 0;
        font-size: 1.25rem;
    }
    .panel .heading {
        font-size: 0.9rem;
    }
    details.section > summary {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 0.6rem;
        cursor: pointer;
        font-weight: 600;
        font-size: 1.25rem;
    }
    .panel details.section > summary {
        font-size: 0.9rem;
    }
    details.section > summary .heading {
        font-size: inherit;
    }
    .count {
        font-size: 0.8rem;
        font-weight: normal;
        color: var(--background-text-muted);
    }
    .explanation {
        margin: 0;
        max-width: 80ch;
        font-size: 0.88rem;
        color: var(--background-text-muted);
    }
    /* Boxes are drawn with rules, not fills: the box's edge, a rule under its note and one
       between its rows, so a row and its opened forms read apart without a block of colour. */
    .group {
        display: flex;
        flex-direction: column;
        min-width: 0;
        border: 1px solid var(--doc-rule);
        border-radius: var(--wb-radius, 0.4rem);
    }
    /* the rule under the note spans its box; the words stop at a readable measure */
    .note-text {
        display: block;
        max-width: 80ch;
    }
    .note {
        margin: 0;
        padding: 0.45rem 0.8rem;
        border-bottom: 1px solid var(--doc-rule);
        font-size: 0.9rem;
        color: var(--background-text-muted);
    }
    .panel .note {
        padding: 0.35rem 0.5rem;
    }
    .rows {
        display: flex;
        flex-direction: column;
        margin: 0;
        padding: 0;
        min-width: 0;
    }
    .rows > :global(li + li) {
        border-top: 1px solid var(--doc-rule);
    }
    .show-all {
        align-self: flex-start;
        padding: 0.2rem 0.6rem;
        border: none;
        border-radius: 0.3rem;
        background-color: var(--tertiary);
        color: var(--tertiary-text);
        font: inherit;
        font-size: 0.85rem;
        cursor: pointer;
    }
    .show-all:hover {
        background-color: color-mix(in srgb, var(--accent) 25%, var(--tertiary));
    }
    /* set apart from the reference above it and the example below it */
    .description {
        max-width: 80ch;
        min-width: 0;
        margin: 0.8rem 0;
    }
    .panel .description {
        margin: 0.3rem 0;
    }
    .description :global(a) {
        color: var(--accent);
        text-decoration: underline;
    }
    .description :global(._markdown p),
    .description :global(._markdown ul),
    .description :global(._markdown ol) {
        font-family: inherit;
        font-weight: normal;
        font-size: inherit;
    }
    .panel .description :global(._markdown p),
    .panel .description :global(._markdown ul),
    .panel .description :global(._markdown ol) {
        width: 100%;
        margin: 0;
    }
</style>
