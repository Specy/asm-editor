<script lang="ts">
    /**
     * One **Form pattern**: its syntax with the symbols the legend explains, the sizes it comes
     * in, its fact line, and, expanded, the forms it stands for with what each says on its own
     * ([the design record](../../../../../../docs/design/instruction-layout.md), decisions 2, 4, 11).
     */
    import FaChevronRight from '~icons/fa-solid/chevron-right'
    import FaArrowRight from '~icons/fa-solid/arrow-right'
    import InlineMarkdown from '#cmp/documentation/entries/InlineMarkdown.svelte'
    import { patternOpens, type FormPattern } from '#lib/documentation/instructions/document.ts'
    import type { AvailableLanguages } from '#lib/Project.svelte.ts'
    import AsmCode from './AsmCode.svelte'
    import FlagStrip from './FlagStrip.svelte'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'

    interface Props {
        pattern: FormPattern
        /** The row's own sentence, when its box holds rows with notes of their own. */
        note?: string
        /** A symbol's legend line as plain text, for its tooltip. */
        meaningOf: (symbol: string) => string | undefined
        onsymbol: (symbol: string) => void
        flagOrder: readonly string[]
        /** The panel: the fact line always sits under the syntax. */
        compact?: boolean
        /** How the opened row's forms are highlighted. */
        language?: AvailableLanguages
        /** Keep the toggle's room on a row that has none, to line up with a box's other rows. */
        aligned?: boolean
    }

    let {
        pattern,
        note,
        meaningOf,
        onsymbol,
        flagOrder,
        compact = false,
        language,
        aligned = true
    }: Props = $props()

    let expanded = $state(false)

    let expandable = $derived(patternOpens(pattern))
    let hasFacts = $derived(pattern.facts.length > 0 || pattern.flags !== undefined)
    /** The facts' box on a line of its own above the syntax, as a row too narrow for both has it. */
    let stacked = $state(false)
    // the facts' box runs the head's whole height, opened or not and with a note under it or
    // not, so every row's box is the same height and opening one moves nothing, unless the box is
    // on a line of its own (owner, 2026-11-11)
    let tall = $derived(hasFacts && !compact && !stacked)
    // closed and with no note, the row is its line alone, and the row's own rule is the box's bottom
    let flush = $derived(tall && !expanded && !note)

    /**
     * Whether the box went onto its own line, which only its place says: the syntax starts lower
     * than the row's top padding when the box is over it. Measured as the row's size changes.
     */
    function watchStacking(head: HTMLElement): () => void {
        // a test's document without it lays nothing out to measure
        if (typeof ResizeObserver === 'undefined') return () => {}
        const observer = new ResizeObserver(() => {
            const lead = head.querySelector('.lead')
            if (!lead) return
            const top = parseFloat(getComputedStyle(head).paddingTop)
            stacked = lead.getBoundingClientRect().top - head.getBoundingClientRect().top > top + 2
        })
        observer.observe(head)
        return () => observer.disconnect()
    }
    let listsForms = $derived(
        pattern.forms.length > 1 ||
            pattern.forms.some(
                (form) => form.expansion?.length || form.note || form.facts.length > 0
            )
    )
    let expands = $derived(pattern.forms.some((form) => form.expansion?.length))
    // forms that are only their code (`add a, b`, `add a, c`…) flow along a line, not one a line
    let plain = $derived(
        pattern.forms.every(
            (form) => !form.expansion?.length && !form.note && form.facts.length === 0
        )
    )
</script>

<li class="pattern-row" class:expanded class:compact>
    <div
        class="pattern-head"
        class:expandable
        class:tall
        class:flush
        {@attach hasFacts && !compact ? watchStacking : undefined}
    >
        <span class="lead">
            {#if expandable}
                <button
                    type="button"
                    class="toggle"
                    aria-expanded={expanded}
                    aria-label={expanded
                        ? 'Hide the forms of this row'
                        : 'Show the forms of this row'}
                    onclick={() => (expanded = !expanded)}
                >
                    <span class="chevron" aria-hidden="true"><FaChevronRight /></span>
                </button>
            {:else if aligned}
                <span class="toggle-space" aria-hidden="true"></span>
            {/if}
            <code class="syntax"
                >{#each pattern.parts as part, index (index)}{#if part.symbol}<button
                            type="button"
                            class="symbol"
                            {@attach tooltip(meaningOf(part.text))}
                            onclick={() => onsymbol(part.text)}>{part.text}</button
                        >{:else}{part.text}{/if}{/each}</code
            >
            {#if pattern.chips.length > 0}
                <span class="chips">
                    {#each pattern.chips as chip (chip.label)}
                        <span class="chip" title={chip.title}>{chip.label}</span>
                    {/each}
                </span>
            {/if}
        </span>
        {#if hasFacts}
            <span class="pattern-facts">
                {#each pattern.facts as fact, index (index)}
                    <span class="fact"><InlineMarkdown source={fact} /></span>
                {/each}
                {#if pattern.flags}
                    <span class="fact"
                        ><FlagStrip order={flagOrder} marks={pattern.flags} compact /></span
                    >
                {/if}
            </span>
        {/if}
    </div>
    {#if note}
        <p class="row-note"><InlineMarkdown source={note} /></p>
    {/if}
    {#if expanded}
        <div class="body">
            {#each pattern.details as detail (detail.label)}
                <div class="detail">
                    <span class="detail-label"
                        >{detail.label}{#if detail.name}<span class="detail-name"
                                >({detail.name})</span
                            >{/if}</span
                    >
                    <span class="modes">
                        {#each detail.values as value (value)}
                            <code class="mode">{value}</code>
                        {/each}
                    </span>
                </div>
            {/each}
            {#if listsForms}
                <ul class="forms" class:plain>
                    {#each pattern.forms as form, index (index)}
                        <li class="form">
                            {#if form.note || form.facts.length > 0}
                                <p class="form-note">
                                    {#if form.note}<InlineMarkdown source={form.note} />{/if}
                                    {#if form.facts.length > 0}<span class="form-facts"
                                            >{form.facts.join(' · ')}</span
                                        >{/if}
                                </p>
                            {/if}
                            <div class="form-line" class:expands>
                                <span class="code-box written"
                                    ><AsmCode code={form.code} {language} /></span
                                >
                                {#if form.expansion?.length}
                                    <span class="arrow" aria-hidden="true"><FaArrowRight /></span>
                                    <span class="code-box expansion"
                                        ><AsmCode
                                            code={form.expansion.join('\n')}
                                            {language}
                                        /></span
                                    >
                                {/if}
                            </div>
                        </li>
                    {/each}
                </ul>
            {/if}
        </div>
    {/if}
</li>

<style>
    .pattern-row {
        list-style: none;
        min-width: 0;
    }
    /* The syntax at the left, the facts' box in the top right corner. A row too narrow for both
       puts the box on a line of its own above the syntax (`wrap-reverse`), so it stays in the
       corner. */
    .pattern-head {
        position: relative;
        display: flex;
        flex-wrap: wrap-reverse;
        align-items: start;
        column-gap: 0.6rem;
        row-gap: 0.1rem;
        min-width: 0;
        padding: 0.3rem 0.8rem 0.3rem 0.5rem;
    }
    .compact .pattern-head {
        flex-wrap: wrap;
        padding: 0.25rem 0.5rem 0.25rem 0.3rem;
    }
    .lead {
        display: flex;
        flex: 1 1 auto;
        flex-wrap: wrap;
        align-items: baseline;
        column-gap: 0.6rem;
        row-gap: 0.1rem;
        min-width: 0;
    }
    .pattern-head.expandable:hover {
        background-color: var(--hover-bg);
    }
    .pattern-head:has(.toggle:focus-visible) {
        outline: 2px solid var(--accent);
        outline-offset: -2px;
    }
    /* The toggle covers its whole row, so a click anywhere on it opens the row; the symbols and
       the chips sit above it, keeping their own tooltip and click. */
    .toggle::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        cursor: pointer;
    }
    .symbol,
    .chip[title] {
        position: relative;
        z-index: 1;
    }
    .toggle,
    .toggle-space {
        flex: none;
        align-self: center;
        width: 1.2rem;
        height: 1.2rem;
    }
    .toggle {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: none;
        border-radius: 0.3rem;
        background: transparent;
        color: var(--background-text-prose);
        cursor: pointer;
    }
    .toggle:focus-visible {
        outline: none;
    }
    .chevron {
        display: flex;
        width: var(--fs-micro);
        height: var(--fs-micro);
        transition: transform var(--dur-base) ease;
    }
    .expanded .chevron {
        transform: rotate(90deg);
    }
    /* On the page everything in a row reads a step larger than in the panel (owner, 2026-11-08):
       the syntax a step above the editor's 16px, at --fs-prose; the facts, notes, details and
       forms at --fs-body; the size chips at --fs-small. The panel keeps its dense sizes */
    .syntax {
        min-width: 0;
        font-family: var(--example-font-family, var(--font-mono));
        font-size: var(--fs-prose);
        line-height: 1.4;
        font-variant-ligatures: none;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
    }
    .compact .syntax {
        font-size: var(--entry-text-size, var(--fs-small));
        line-height: var(--example-line-height, 1.4);
    }
    .symbol {
        padding: 0;
        border: none;
        background: transparent;
        font: inherit;
        color: var(--accent);
        font-style: italic;
        cursor: help;
        text-decoration: underline dotted color-mix(in srgb, var(--accent) 55%, transparent);
        text-underline-offset: 0.25em;
    }
    .symbol:focus-visible {
        outline: 2px solid var(--accent);
        border-radius: 0.2rem;
    }
    .chips {
        display: inline-flex;
        flex-wrap: wrap;
        gap: 0.25rem;
        align-self: center;
    }
    .chip {
        padding: 0 0.35rem;
        border-radius: 0.3rem;
        font-family: var(--font-mono);
        font-size: var(--fs-small);
        line-height: 1.5;
        background-color: var(--tertiary);
        color: var(--tertiary-text);
    }
    .compact .chip {
        font-size: var(--entry-caption-size, var(--fs-caption));
    }
    .chip[title] {
        cursor: help;
    }
    /* the facts in a box drawn with the row's rules, flush with its top and right edges, its
       bottom left corner rounded as the row's box is; a rule between each fact; their text muted
       (owner, 2026-11-11) */
    .pattern-facts {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        max-width: calc(100% + 0.8rem);
        margin: -0.3rem -0.8rem 0 auto;
        border-left: 1px solid var(--doc-rule, var(--tertiary));
        border-bottom: 1px solid var(--doc-rule, var(--tertiary));
        border-bottom-left-radius: var(--wb-radius, var(--r-control));
        overflow: hidden;
        font-size: var(--fs-body);
        color: var(--text-muted);
    }
    /* Each fact is ruled on its left and its top, a pixel outside its place, and the box clips
       the rules on its own edges: a fact that starts a line shows only the box's left rule, and a
       box too narrow for its facts on one line has a rule between its lines, its facts growing to
       fill each line so that the rule spans the box (owner, 2026-11-11) */
    .fact {
        flex-grow: 1;
        margin: -1px 0 0 -1px;
        padding: 0.25rem 0.7rem 0.2rem;
        border-top: 1px solid var(--doc-rule, var(--tertiary));
        border-left: 1px solid var(--doc-rule, var(--tertiary));
        line-height: 1.3;
    }
    /* The box runs from the head's top edge to its bottom one, its left rule and the rules
       between its facts edge to edge, its facts centred, which sets them on the syntax's
       baseline. Over a note or an opened row's forms it draws its bottom rule and corner; on a
       closed row with no note, the row's own rule stands for them, the box's bottom rule kept but
       transparent so that the box is the same size either way (owner, 2026-11-11) */
    .tall .pattern-facts {
        align-self: stretch;
        align-items: stretch;
        margin-bottom: -0.3rem;
    }
    .tall .fact {
        display: flex;
        align-items: center;
    }
    .flush .pattern-facts {
        border-bottom-color: transparent;
        border-bottom-left-radius: 0;
    }
    /* In the narrow panel the fact line sits under the syntax, past the toggle, with no box,
       its facts still ruled apart */
    .compact .pattern-facts {
        flex-basis: 100%;
        max-width: none;
        margin: 0 0 0 1.8rem;
        border: none;
        border-radius: 0;
        font-size: var(--entry-text-size, var(--fs-small));
    }
    /* the rule in the gap before each fact, the box clipping the one before a line's first fact,
       so every line starts at the same edge; the pointer passes through to the row's toggle, as
       it did before the facts had a place of their own */
    .compact .pattern-facts {
        column-gap: 1rem;
    }
    .compact .fact {
        position: relative;
        flex-grow: 0;
        margin: 0;
        padding: 0;
        border: none;
        line-height: inherit;
        pointer-events: none;
    }
    .compact .fact::before {
        content: '';
        position: absolute;
        top: 0;
        bottom: 0;
        left: calc(-0.5rem - 0.5px);
        border-left: 1px solid var(--doc-rule, var(--tertiary));
    }
    .row-note {
        margin: -0.15rem 0.8rem 0.35rem 2.3rem;
        font-size: var(--fs-body);
        color: var(--background-text-prose);
    }
    /* on a phone the note starts under the head's padding, not tucked into it (owner,
       2026-11-11), at the phone width OperandLegend uses */
    @media (max-width: 600px) {
        .row-note {
            margin-top: 0;
        }
    }
    .body {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin: 0;
        padding: 0.1rem 0.8rem 0.6rem 2.3rem;
        min-width: 0;
    }
    .compact .body {
        padding: 0.1rem 0.5rem 0.5rem 0.9rem;
    }
    .detail {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 0.35rem 0.6rem;
        padding: 0.2rem 0;
        font-size: var(--fs-body);
    }
    .detail-label {
        min-width: 11rem;
        color: var(--secondary-text);
    }
    .detail-name {
        margin-left: 0.3em;
        color: var(--background-text-prose);
    }
    .modes {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
    }
    .mode {
        padding: 0.1rem 0.4rem;
        border-radius: var(--r-chip);
        font-family: var(--font-mono);
        font-size: var(--fs-body);
        font-variant-ligatures: none;
        background-color: var(--tertiary);
        color: var(--tertiary-text);
    }
    .forms {
        display: flex;
        flex-direction: column;
        margin: 0;
        padding: 0;
        min-width: 0;
        container-type: inline-size;
    }
    /* each form of the row apart from the next, as the rows are */
    .form + .form {
        border-top: 1px dashed var(--doc-rule, var(--tertiary));
    }
    .forms.plain {
        flex-direction: row;
        flex-wrap: wrap;
        gap: 0.4rem;
        padding: 0.3rem 0;
    }
    .forms.plain .form {
        padding: 0;
        border-top: none;
    }
    .form {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        padding: 0.5rem 0;
        list-style: none;
        font-size: var(--fs-body);
        min-width: 0;
    }
    .form-line {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        gap: 0.3rem 0.8rem;
        min-width: 0;
    }
    /* the form fills its column up to the arrow, the expansion follows it */
    .form-line.expands .written {
        flex: 0 0 15rem;
        width: auto;
    }
    /* the form and what it becomes, in the same box */
    .code-box {
        display: block;
        width: fit-content;
        max-width: 100%;
        box-sizing: border-box;
        padding: 0.2rem 0.6rem;
        border-radius: 0.3rem;
        background-color: color-mix(in srgb, var(--tertiary) 40%, transparent);
        overflow-x: auto;
    }
    .form-note {
        max-width: 80ch;
        margin: 0;
        font-size: var(--fs-body);
        color: var(--background-text-prose);
    }
    /* the panel's dense sizes, a step larger in an entry the Workbench's panel has expanded, which
       sets `--entry-text-size` and `--entry-caption-size` (EntryRow; owner, 2026-11-08): the syntax
       then at the editor's 16px, as the entry's code samples are */
    .compact :is(.row-note, .detail, .mode, .form, .form-note) {
        font-size: var(--entry-text-size, var(--fs-small));
    }
    .form-facts {
        margin-left: 0.5rem;
    }
    .arrow {
        display: flex;
        width: var(--fs-small);
        height: var(--fs-small);
        margin-top: 0.5rem;
        color: var(--background-text-prose);
    }
    .compact .arrow {
        width: var(--entry-caption-size, var(--fs-caption));
        height: var(--entry-caption-size, var(--fs-caption));
        margin-top: 0.45rem;
    }
    .expansion {
        flex: 0 1 auto;
        min-width: 0;
    }
    /* too narrow for a form and its expansion side by side: the expansion goes under it */
    @container (max-width: 34rem) {
        .form-line.expands .written {
            flex-basis: 100%;
        }
        .arrow {
            display: none;
        }
    }
</style>
