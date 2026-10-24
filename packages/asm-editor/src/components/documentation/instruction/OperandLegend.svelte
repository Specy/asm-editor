<script lang="ts" module>
    /** A symbol as part of an element id: `<register list>` has a space and brackets. */
    export function symbolSlug(symbol: string): string {
        return Array.from(symbol, (char) =>
            /[a-z0-9]/i.test(char) ? char : `_${char.codePointAt(0)!.toString(16)}`
        ).join('')
    }
</script>

<script lang="ts">
    /**
     * The symbols the rows use, one line each: what they stand for and their range
     * ([the design record](../../../../../../docs/design/instruction-layout.md), decision 7). A
     * symbol tapped in a row marks its line here.
     */
    import InlineMarkdown from '#cmp/documentation/entries/InlineMarkdown.svelte'
    import type { OperandSymbol } from '#lib/documentation/instructions/document.ts'
    import { resolveHref } from '#lib/hrefs.ts'

    interface Props {
        operands: readonly OperandSymbol[]
        /** The symbol last tapped in a row. */
        marked?: string
        idPrefix: string
        disableLinks?: boolean
        compact?: boolean
        /** Starts closed, behind its heading: a long legend in the narrow panel. */
        collapsible?: boolean
    }

    let {
        operands,
        marked,
        idPrefix,
        disableLinks = false,
        compact = false,
        collapsible = false
    }: Props = $props()
    let open = $state(false)

    // a symbol tapped in a row opens the legend to show its line
    $effect(() => {
        if (marked) open = true
    })
</script>

{#snippet lines()}
    <dl>
        {#each operands as operand (operand.symbol)}
            <div
                class="line"
                class:marked={marked === operand.symbol}
                id={`${idPrefix}-${symbolSlug(operand.symbol)}`}
            >
                <dt><code>{operand.symbol}</code></dt>
                <dd>
                    <InlineMarkdown source={operand.meaning} />
                    {#if operand.href && !disableLinks}
                        <a class="more" href={resolveHref(operand.href)}>More</a>
                    {/if}
                </dd>
            </div>
        {/each}
    </dl>
{/snippet}

{#if collapsible}
    <details class="legend" class:compact aria-label="Operands" bind:open>
        <summary
            ><h3>Operands</h3>
            <span class="count">{operands.length}</span></summary
        >
        {@render lines()}
    </details>
{:else}
    <section class="legend" class:compact aria-label="Operands">
        <h3>Operands</h3>
        {@render lines()}
    </section>
{/if}

<style>
    .legend {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        min-width: 0;
    }
    h3 {
        margin: 0;
        font-size: 1rem;
    }
    summary {
        display: flex;
        align-items: baseline;
        gap: 0.5rem;
        cursor: pointer;
    }
    summary h3 {
        display: inline;
    }
    .count {
        font-size: 0.8rem;
        color: var(--background-text-muted);
    }
    .compact h3 {
        font-size: 0.85rem;
    }
    /* one line a symbol, ruled apart, the text kept to a readable measure */
    dl {
        display: grid;
        grid-template-columns: max-content minmax(0, 80ch);
        width: fit-content;
        max-width: 100%;
        margin: 0;
        border: 1px solid var(--doc-rule, var(--tertiary));
        border-radius: var(--wb-radius, 0.4rem);
        font-size: 0.92rem;
    }
    .compact dl {
        font-size: 0.85rem;
    }
    .line {
        display: grid;
        grid-column: 1 / -1;
        grid-template-columns: subgrid;
        column-gap: 1rem;
        padding: 0.45rem 0.8rem;
        border-top: 1px solid var(--doc-rule, var(--tertiary));
        transition: background-color 0.3s ease;
    }
    .compact .line {
        padding: 0.35rem 0.5rem;
    }
    .line:first-child {
        border-top: none;
    }
    .marked {
        background-color: color-mix(in srgb, var(--accent) 16%, transparent);
    }
    dt,
    dd {
        margin: 0;
    }
    dt code {
        font-family: 'Fira Code', monospace;
        font-variant-ligatures: none;
        color: var(--accent);
        white-space: nowrap;
    }
    dd {
        min-width: 0;
        line-height: 1.5;
        overflow-wrap: anywhere;
    }
    .more {
        margin-left: 0.4rem;
        font-size: 0.85em;
        color: var(--accent);
        text-decoration: underline;
    }
</style>
