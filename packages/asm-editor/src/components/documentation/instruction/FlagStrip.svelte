<script lang="ts">
    /**
     * The status flags an instruction changes, in the order of its language's register panel, with
     * the legend once ([the design record](../../../../../../docs/design/instruction-layout.md),
     * decision 5). With `marks` from one row, it is that row's compact line instead.
     */
    import {
        FLAG_MARK_GLYPHS,
        FLAG_MARK_MEANINGS,
        type FlagMarkKind,
        type FlagMarks
    } from '#lib/documentation/instructions/document.ts'

    interface Props {
        order: readonly string[]
        marks: FlagMarks
        reads?: readonly string[]
        notes?: Record<string, string>
        note?: string
        /** Some rows do otherwise, and say so on their own line. */
        varies?: boolean
        /** One row's flags on its fact line: the flags it changes, without a legend. */
        compact?: boolean
    }

    let {
        order,
        marks,
        reads = [],
        notes = {},
        note,
        varies = false,
        compact = false
    }: Props = $props()

    const KIND_ORDER: FlagMarkKind[] = ['changed', 'cleared', 'set', 'undefined', 'unchanged']

    let used = $derived(
        KIND_ORDER.filter((kind) =>
            order.some((flag) => (marks[flag]?.kind ?? 'unchanged') === kind)
        )
    )
    let changesNothing = $derived(
        order.every((flag) => (marks[flag]?.kind ?? 'unchanged') === 'unchanged')
    )

    function titleOf(flag: string): string {
        const mark = marks[flag]
        const kind = mark?.kind ?? 'unchanged'
        return `${flag}: ${mark?.title ?? FLAG_MARK_MEANINGS[kind]}`
    }
</script>

{#if compact}
    <span class="compact">
        {#if changesNothing}
            flags unchanged
        {:else}
            {#each order.filter((flag) => (marks[flag]?.kind ?? 'unchanged') !== 'unchanged') as flag (flag)}
                {@const kind = marks[flag].kind}
                <span class="compact-flag" title={titleOf(flag)}
                    >{flag}<span class="glyph" data-kind={kind}>{FLAG_MARK_GLYPHS[kind]}</span
                    ></span
                >
            {/each}
        {/if}
    </span>
{:else}
    <section class="flags" aria-label="Status flags">
        <div class="strip" style:--flag-count={order.length}>
            {#each order as flag (flag)}
                <span class="name" class:read={reads.includes(flag)}>{flag}</span>
            {/each}
            {#each order as flag (flag)}
                {@const kind = marks[flag]?.kind ?? 'unchanged'}
                <span class="mark" data-kind={kind} title={titleOf(flag)}>
                    {FLAG_MARK_GLYPHS[kind]}
                </span>
            {/each}
        </div>
        <ul class="legend">
            {#if changesNothing}
                <li class="legend-item">Changes no flag</li>
            {:else}
                {#each used as kind (kind)}
                    <li class="legend-item">
                        <span class="glyph" data-kind={kind}>{FLAG_MARK_GLYPHS[kind]}</span>
                        {FLAG_MARK_MEANINGS[kind]}
                    </li>
                {/each}
            {/if}
            {#if reads.length > 0}
                <li class="legend-item reads">
                    Reads <span class="read-flags">{reads.join(' ')}</span>
                </li>
            {/if}
        </ul>
        {#if varies}
            <p class="varies">The rows that do otherwise show their own flags.</p>
        {/if}
        {#if Object.keys(notes).length > 0 || note}
            <ul class="notes">
                {#each order.filter((flag) => notes[flag]) as flag (flag)}
                    <li><strong>{flag}</strong> {notes[flag]}</li>
                {/each}
                {#if note}
                    <li>{note}</li>
                {/if}
            </ul>
        {/if}
    </section>
{/if}

<style>
    .flags {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        min-width: 0;
    }
    .strip {
        display: grid;
        grid-template-columns: repeat(var(--flag-count), minmax(2.2rem, max-content));
        width: fit-content;
        max-width: 100%;
        overflow-x: auto;
        border: var(--wb-card-edge, 1px solid color-mix(in srgb, var(--tertiary) 60%, transparent));
        border-radius: var(--wb-radius, 0.4rem);
        background: var(--secondary);
        color: var(--secondary-text);
    }
    .name,
    .mark {
        padding: 0.15rem 0.5rem;
        text-align: center;
        font-family: 'Fira Code', monospace;
        font-variant-ligatures: none;
    }
    .name {
        font-size: 0.8rem;
        color: var(--background-text-muted);
        border-bottom: 1px solid color-mix(in srgb, var(--tertiary) 70%, transparent);
    }
    .name.read {
        text-decoration: underline dotted;
        text-underline-offset: 0.2em;
    }
    .mark {
        font-size: 0.95rem;
        cursor: help;
    }
    .glyph[data-kind='changed'],
    .mark[data-kind='changed'] {
        color: var(--accent);
    }
    .glyph[data-kind='unchanged'],
    .mark[data-kind='unchanged'] {
        color: var(--background-text-muted);
        opacity: 0.7;
    }
    .glyph[data-kind='undefined'],
    .mark[data-kind='undefined'] {
        color: var(--hint);
    }
    .legend {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        margin: 0;
        padding: 0;
        list-style: none;
        font-size: 0.8rem;
        color: var(--background-text-muted);
    }
    .legend-item {
        display: inline-flex;
        align-items: baseline;
        gap: 0.35rem;
        padding: 0.1rem 0.55rem;
        border: 1px solid color-mix(in srgb, var(--tertiary) 80%, transparent);
        border-radius: 999px;
        background-color: color-mix(in srgb, var(--tertiary) 30%, transparent);
    }
    .glyph {
        font-family: 'Fira Code', monospace;
    }
    .reads {
        color: var(--secondary-text);
    }
    .read-flags {
        font-family: 'Fira Code', monospace;
        font-variant-ligatures: none;
    }
    .varies {
        margin: 0;
        font-size: 0.8rem;
        color: var(--background-text-muted);
    }
    .notes {
        margin: 0;
        padding-left: 1rem;
        font-size: 0.85rem;
        color: var(--background-text-muted);
    }
    .compact {
        display: inline-flex;
        flex-wrap: wrap;
        gap: 0.1rem 0.45rem;
        font-family: 'Fira Code', monospace;
        font-variant-ligatures: none;
    }
    .compact-flag {
        cursor: help;
    }
    .compact-flag .glyph {
        margin-left: 0.1rem;
    }
</style>
