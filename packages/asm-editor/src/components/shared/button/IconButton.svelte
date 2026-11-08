<script lang="ts">
    /**
     * A button that is only an icon: the `ghost` role of `Button` (design-system.md, D5) in sizes
     * of its own, its icon alone until the pointer takes it, then the surface's text at 10%, as a
     * hovered row is (D4). Its `label` is its name, read by a screen reader and by nothing else, so
     * it is required; a Tooltip written on it (`{@attach tooltip(…)}`, which reaches the button
     * with the rest of the props) is its description, never its name (ADR 0064). `pressed` makes
     * it a toggle, filled with the accent while on, as a toolbar's chosen tool is (D14);
     * `emphasis` fills it with the accent too, for a state it shows rather than one it toggles.
     * `fill` makes it the square at a strip's or a bar's end, as tall as the row it sits in.
     *
     * Its look weighs only `.icon-button` and the scoping class, its size and `fill` behind
     * `:where()`, as Button's sizes are (variants.scss): a caller's `.something :global(.x)`
     * outweighs it whichever stylesheet loads last.
     */
    import type { Snippet } from 'svelte'
    import type { HTMLButtonAttributes } from 'svelte/elements'

    interface Props extends Omit<HTMLButtonAttributes, 'aria-label' | 'aria-pressed'> {
        /** What it does, in words: its accessible name. */
        label: string
        /** sm 1.4rem, md 1.8rem, lg 2.4rem square. */
        size?: 'sm' | 'md' | 'lg'
        /** A toggle, on or off; left out, a plain button. */
        pressed?: boolean
        /**
         * Filled with the accent while true, as a pressed one is, without being a toggle: for a
         * button whose action the state calls for, such as Search address while the typed address
         * is not the one in view.
         */
        emphasis?: boolean
        /** Its icon dimmed to the surface's muted text until the pointer or the keyboard is on it. */
        quiet?: boolean
        /**
         * As tall as the row it sits in rather than square: `--icon-button-cell` wide (its size's
         * square when unset) with `--icon-button-radius` corners (square when unset), which the
         * caller sets on it. Its fill stops at a rule its row draws under it, as a tab strip's.
         */
        fill?: boolean
        /** The button itself, for what is placed against it, such as a popover it opens. */
        el?: HTMLElement
        children: Snippet
        onClick?: (e: MouseEvent) => void
    }

    let {
        label,
        size = 'md',
        pressed,
        emphasis = false,
        quiet = false,
        fill = false,
        class: className,
        el = $bindable(),
        children,
        onClick,
        ...rest
    }: Props = $props()
</script>

<button
    bind:this={el}
    type="button"
    {...rest}
    class={['icon-button', size, className]}
    class:quiet
    class:fill
    class:pressed
    class:emphasis
    aria-label={label}
    aria-pressed={pressed}
    onclick={onClick}
>
    {@render children()}
</button>

<style lang="scss">
    @use '../../../styles/focus.scss' as *;

    .icon-button {
        display: grid;
        place-items: center;
        flex: none;
        width: var(--icon-button-size);
        height: var(--icon-button-size);
        padding: 0;
        border: none;
        border-radius: var(--r-control);
        background-color: transparent;
        color: inherit;
        cursor: pointer;
        transition:
            background-color var(--dur-fast),
            color var(--dur-fast);
        /* inside its own edge, as a tray's tool's, so a button in a strip or a corner keeps it */
        @include focus-ring($inset: true);

        /* an icon on its own takes the size's; one in an `<Icon>` keeps the size it was given */
        > :global(svg) {
            width: var(--icon-button-glyph);
            height: var(--icon-button-glyph);
        }

        &:hover:not(:disabled) {
            background-color: var(--hover-bg);
        }

        &:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
    }

    .icon-button:where(.sm) {
        --icon-button-size: 1.4rem;
        --icon-button-glyph: var(--fs-caption);
        border-radius: var(--r-chip);
    }
    .icon-button:where(.md) {
        --icon-button-size: 1.8rem;
        --icon-button-glyph: var(--fs-small);
    }
    .icon-button:where(.lg) {
        --icon-button-size: 2.4rem;
        /* the prose step at its base size, which a reading page's or a phone's does not change */
        --icon-button-glyph: 1.1rem;
    }

    .icon-button:where(.fill) {
        align-self: stretch;
        width: var(--icon-button-cell, var(--icon-button-size));
        height: auto;
        border-radius: var(--icon-button-radius, 0);
        background-clip: padding-box;
    }

    .quiet:not(:hover, :focus-visible, .pressed, .emphasis) {
        color: var(--text-muted);
    }

    /* on, and so under the pointer too; the ring inside it in the accent's text, as the accent
       ring would vanish on the accent fill */
    .pressed,
    .pressed:hover:not(:disabled),
    .emphasis,
    .emphasis:hover:not(:disabled) {
        background-color: var(--accent);
        color: var(--accent-text);
    }
    .pressed:focus-visible,
    .emphasis:focus-visible {
        outline-color: var(--accent-text);
    }
</style>
