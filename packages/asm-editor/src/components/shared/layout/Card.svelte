<script lang="ts">
    /**
     * The page **Card** (CONTEXT.md): a panel laid on a page, drawn on the Workbench's card tokens
     * (`workbench.css`, design-system.md D1), the card surface inside a 1px hairline edge with the
     * Card radius, as a project card is. Given `href` it is a link, the whole card, and only then
     * does it take the hover, its surface a step lighter. A card that holds more than one action
     * marks its main link with the global class `card-cover`: that link stretches over the card,
     * which then hovers as a link card does, while its other controls sit above it (they need
     * `position: relative` and a `z-index`, and the cover link `position: static`).
     */
    import type { Snippet } from 'svelte'
    import type { HTMLAttributes } from 'svelte/elements'
    import type { ResolvedPathname } from '$app/types'
    import '#cmp/specific/workbench/workbench.css'

    interface Props extends HTMLAttributes<HTMLElement> {
        /** Where the card leads, resolved (`resolve()`, `resolveHref()`): the card is then one link. */
        href?: ResolvedPathname
        /** The element for a card that is not a link: a `section` or an `article` that has a heading. */
        element?: 'div' | 'section' | 'article'
        padding?: string
        gap?: string
        style?: string
        /**
         * Whether a link card's surface lightens under the pointer; off for a card that answers the
         * hover another way, as the blog's cards do with their picture.
         */
        hoverTint?: boolean
        children?: Snippet
    }

    let {
        href,
        element = 'div',
        padding,
        gap,
        style = '',
        hoverTint = true,
        class: className,
        children,
        ...rest
    }: Props = $props()
</script>

<!-- a link given `href`, or the element asked for -->
<svelte:element
    this={href === undefined ? element : 'a'}
    {...rest}
    {href}
    class={['card', 'wb-cards', className]}
    class:link={href !== undefined}
    class:no-tint={!hoverTint}
    style="{padding ? `padding: ${padding};` : ''}{gap ? `gap: ${gap};` : ''}{style}"
>
    {@render children?.()}
</svelte:element>

<style lang="scss">
    @use '../../../styles/radius.scss';

    /* positioned, so a covering link and what a caller places inside are placed against it */
    .card {
        position: relative;
        display: flex;
        flex-direction: column;
        min-width: 0;
        background-color: var(--wb-surface);
        color: var(--secondary-text);
        border: var(--wb-card-edge);
        border-radius: var(--wb-radius);
    }

    .card:has(:global(.card-cover)) {
        isolation: isolate;
    }

    /* the main link of a card with more actions, over the whole card inside its 1px edge */
    .card :global(.card-cover)::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: radius.nested-radius(var(--wb-radius), $border: 1px);
    }

    /* the hover: the card's own surface a step lighter, as a layered surface is, not a grey and
       not the accent (owner, 2026-11-08; D4's --hover-bg, the text at 10%, which rows keep, read
       as a grey here). The surface takes 45% of --tertiary, as a section's header band takes 28%
       (--wb-section-header), and 3% of its text on top, without which the step is too faint to
       see on the themes whose --tertiary is close to their --secondary (RISC-V, Z80). It fades in
       as the home page's tiles do */
    .link,
    .card:has(:global(.card-cover)) {
        transition: background-color var(--dur-fast);
    }
    .link:not(.no-tint):hover,
    .card:has(:global(.card-cover)):not(.no-tint):hover {
        background-color: color-mix(
            in srgb,
            currentColor 3%,
            color-mix(in srgb, var(--wb-surface) 55%, var(--tertiary))
        );
    }
</style>
