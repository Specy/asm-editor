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
    <div class="pattern-head" class:expandable>
        {#if expandable}
            <button
                type="button"
                class="toggle"
                aria-expanded={expanded}
                aria-label={expanded ? 'Hide the forms of this row' : 'Show the forms of this row'}
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
        {#if hasFacts}
            <span class="pattern-facts">
                {#each pattern.facts as fact, index (index)}
                    {#if index > 0}<span class="dot" aria-hidden="true">·</span>{/if}
                    <span class="fact"><InlineMarkdown source={fact} /></span>
                {/each}
                {#if pattern.flags}
                    {#if pattern.facts.length > 0}<span class="dot" aria-hidden="true">·</span>{/if}
                    <FlagStrip order={flagOrder} marks={pattern.flags} compact />
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
    .pattern-head {
        position: relative;
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        column-gap: 0.6rem;
        row-gap: 0.1rem;
        min-width: 0;
        padding: 0.3rem 0.8rem 0.3rem 0.5rem;
    }
    .compact .pattern-head {
        padding: 0.25rem 0.5rem 0.25rem 0.3rem;
    }
    .pattern-head.expandable:hover {
        background-color: color-mix(in srgb, var(--tertiary) 45%, transparent);
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
        color: var(--background-text-muted);
        cursor: pointer;
    }
    .toggle:focus-visible {
        outline: none;
    }
    .chevron {
        display: flex;
        width: 0.6rem;
        height: 0.6rem;
        transition: transform 0.15s ease;
    }
    .expanded .chevron {
        transform: rotate(90deg);
    }
    .syntax {
        min-width: 0;
        font-family: var(--example-font-family, 'Fira Code', monospace);
        font-size: var(--example-font-size, 1rem);
        line-height: var(--example-line-height, 1.4);
        font-variant-ligatures: none;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
    }
    .compact .syntax {
        font-size: 0.9rem;
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
        font-family: 'Fira Code', monospace;
        font-size: 0.75rem;
        line-height: 1.5;
        background-color: var(--tertiary);
        color: var(--tertiary-text);
    }
    .chip[title] {
        cursor: help;
    }
    .pattern-facts {
        display: inline-flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 0.1rem 0.4rem;
        margin-left: auto;
        font-size: 0.85rem;
        color: var(--background-text-muted);
    }
    /* In the narrow panel the fact line sits under the syntax, past the toggle */
    .compact .pattern-facts {
        flex-basis: 100%;
        margin-left: 1.8rem;
        font-size: 0.8rem;
    }
    .dot {
        opacity: 0.6;
    }
    .row-note {
        margin: -0.15rem 0.8rem 0.35rem 2.3rem;
        font-size: 0.85rem;
        color: var(--background-text-muted);
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
        font-size: 0.85rem;
    }
    .detail-label {
        min-width: 11rem;
        color: var(--secondary-text);
    }
    .detail-name {
        margin-left: 0.3em;
        color: var(--background-text-muted);
    }
    .modes {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
    }
    .mode {
        padding: 0.1rem 0.4rem;
        border-radius: 0.25rem;
        font-family: 'Fira Code', monospace;
        font-size: 0.8rem;
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
        font-size: 0.88rem;
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
        font-size: 0.82rem;
        color: var(--background-text-muted);
    }
    .form-facts {
        margin-left: 0.5rem;
    }
    .arrow {
        display: flex;
        width: 0.75rem;
        height: 0.75rem;
        margin-top: 0.45rem;
        color: var(--background-text-muted);
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
