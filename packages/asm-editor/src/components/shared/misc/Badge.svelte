<script lang="ts">
    /**
     * A word or a number pinned to a row, a tab or a heading: the ENTRY mark, a count of problems
     * or matches, "current", "read-only" (design-system.md, stage 3 item 7). One shape and size for
     * all of them, a pill in small bold caps-height text; what it means is its `tone`, the accent
     * for "the one you have" (D4), the status colours for problems (D9), the surface's own text
     * for anything neutral. Soft by default, its text in the tone over a faint tint of it and a
     * hairline; `solid` fills it with the tone, for the current item's mark and for a count that
     * asks to be seen. `weight="medium"` draws its text at 500 rather than bold.
     *
     * Its look weighs only `.badge` and the scoping class, its tone, fill and weight behind
     * `:where()`, as Button's sizes are (variants.scss): a caller's `.something :global(.badge)`
     * outweighs it whichever stylesheet loads last.
     */
    import type { Snippet } from 'svelte'
    import type { HTMLAttributes } from 'svelte/elements'

    interface Props extends HTMLAttributes<HTMLSpanElement> {
        /** neutral (the surface's own text), accent, danger, warning, or info (the theme's second accent). */
        tone?: 'neutral' | 'accent' | 'danger' | 'warning' | 'info'
        /** Filled with the tone rather than tinted with it. */
        solid?: boolean
        /** Its text's weight: bold, as every Badge's is when left out, or medium (500). */
        weight?: 'bold' | 'medium'
        children: Snippet
    }

    let {
        tone = 'neutral',
        solid = false,
        weight = 'bold',
        class: className,
        children,
        ...rest
    }: Props = $props()
</script>

<span {...rest} class={['badge', tone, className]} class:solid class:medium={weight === 'medium'}
    >{@render children()}</span
>

<style lang="scss">
    /* the tint and the hairline are drawn from the badge's own text colour (currentColor in a
       background or a border is the element's colour), so each tone only names its colour */
    .badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: none;
        box-sizing: border-box;
        min-width: 1.1rem;
        height: 1.1rem;
        padding: 0 0.35rem;
        border: 1px solid color-mix(in srgb, currentColor 45%, transparent);
        border-radius: var(--r-pill);
        background-color: color-mix(in srgb, currentColor 10%, transparent);
        font-family: var(--font-ui);
        font-size: var(--fs-micro);
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        line-height: 1;
        letter-spacing: 0.04em;
        white-space: nowrap;
    }

    .badge:where(.medium) {
        font-weight: 500;
    }

    .badge:where(.neutral) {
        color: color-mix(in srgb, currentColor 70%, transparent);
    }
    .badge:where(.accent) {
        color: var(--accent);
    }
    /* the status colours mixed with the surrounding text, so that a soft count reads at 4.5:1 or
       more on every built-in theme's background, panel and selected row, whose accent tint the
       pure colours fall below (the danger red to 2.7:1); the text being the surface's, the mix
       stays readable on a light theme too */
    .badge:where(.danger) {
        color: color-mix(in srgb, var(--danger) 30%, currentColor);
    }
    .badge:where(.warning) {
        color: color-mix(in srgb, var(--warning) 45%, currentColor);
    }
    .badge:where(.info) {
        color: var(--accent2);
    }

    .badge:where(.solid) {
        border-color: transparent;
    }
    .badge:where(.solid.neutral) {
        color: inherit;
        background-color: color-mix(in srgb, currentColor 14%, transparent);
    }
    .badge:where(.solid.accent) {
        color: var(--accent-text);
        background-color: var(--accent);
    }
    .badge:where(.solid.danger) {
        color: var(--danger-text);
        background-color: var(--danger);
    }
    .badge:where(.solid.warning) {
        color: var(--warning-text);
        background-color: var(--warning);
    }
    .badge:where(.solid.info) {
        color: var(--accent2-text);
        background-color: var(--accent2);
    }
</style>
