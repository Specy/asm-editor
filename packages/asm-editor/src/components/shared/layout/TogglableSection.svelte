<script lang="ts">
    /**
     * A section that folds under its heading, drawn as a disclosure: the heading holds the button
     * that folds it (`<hN><button aria-expanded>`), so the title is in the page's outline at its
     * `level` and the button says whether the section is open.
     */
    import FaAngleRight from '~icons/fa-solid/angle-right'
    import Icon from '#cmp/shared/layout/Icon.svelte'
    interface Props {
        open?: boolean
        /** The heading's level in the page's outline. */
        level?: 2 | 3 | 4
        style?: string
        sectionStyle?: string
        /** The heading's text, which the button holds; no heading of its own. */
        title?: import('svelte').Snippet
        /**
         * A sidebar's section (SiteSidebarLayout's: the documentation's and the course's): its
         * heading, in the sidebar's text size, stays at the top of the box it scrolls in while
         * its rows scroll under it, and its button is the whole row, out to the box's sides. Its
         * rows run out to the box's leading edge, their text at `--row-indent`, under the
         * heading's name.
         */
        sticky?: boolean
        children?: import('svelte').Snippet
    }

    let {
        open = $bindable(true),
        level = 2,
        style = '',
        sectionStyle = '',
        title,
        sticky = false,
        children
    }: Props = $props()
    let cantAnimate = $state(true)
    const id = $props.id()
</script>

<section class="section" class:open class:sticky {style}>
    <svelte:element this={`h${level}`} class="section-heading">
        <button
            class="section-title"
            aria-expanded={open}
            aria-controls={id}
            onclick={() => {
                open = !open
                cantAnimate = false
            }}
        >
            <Icon
                style={`transform: rotate(${open ? 90 : 0}deg); transition: transform var(--dur-base) cubic-bezier(.54,.9,0,.97); color: var(--accent); `}
                size="h3"
            >
                <FaAngleRight />
            </Icon>
            <span class="title-text">{@render title?.()}</span>
        </button>
    </svelte:element>
    <div {id} class="column sub-section-content" class:open class:cantAnimate style={sectionStyle}>
        {@render children?.()}
    </div>
</section>

<style lang="scss">
    @use '../../../styles/focus.scss' as *;

    /* the button draws the title; the heading only names its level */
    .section-heading {
        margin: 0;
        font: inherit;
    }

    /* A sidebar's section (owner, 2026-11-08), 0.5rem in from the box it scrolls in at either
       side (`--inset`) and above and below. Its heading is pinned at the top of the content of
       that box, below the box's padding, where MaskedScroll's faded edge (as tall as that
       padding, --mask-size) ends, on the sidebar's fill; its shadow, a copy of it moved up by
       that edge, covers the band above it, so the rows that scroll on under it are hidden there
       too. It stays inside its section, so it leaves with the section's last row as the next
       heading comes up. It is drawn above the rows, which their fade-in leaves a layer of their
       own. Its button is the whole row: out across the section's sides, and 0.3rem under the
       title, which its margin gives back so nothing below moves. */
    .section.sticky {
        --inset: 0.5rem;
        gap: 0.3rem;
        padding: 0.5rem var(--inset);
    }
    .sticky > .section-heading {
        position: sticky;
        top: 0;
        z-index: 1;
        margin: 0 calc(-1 * var(--inset)) -0.3rem;
        background-color: var(--secondary);
        box-shadow: 0 calc(-1 * var(--mask-size, 0rem)) 0 var(--secondary);
    }
    .sticky .section-title {
        width: 100%;
        padding: 0 var(--inset) 0.3rem;
        /* the ring inside the row: the box's sides would clip it */
        @include focus-ring($inset: true);
    }
    /* the title in the sidebar's text size */
    .sticky .title-text {
        font-size: 1rem;
    }
    /* the rows from the box's leading edge, edge to edge, with no rule beside them, so the
       current one's accent edge is the sidebar's side; their text under the title's (the
       section's inset, the arrow's 1.4rem and its 0.4rem gap, less the title's -0.1rem) */
    .sticky > .sub-section-content {
        --row-indent: calc(var(--inset) + 1.4rem + 0.4rem - 0.1rem);
        gap: 0;
        margin-left: calc(-1 * var(--inset));
        padding-left: 0;
        border-left: none;
    }

    .section-title {
        font-size: var(--fs-h3);
        display: flex;
        gap: 0.4rem;
        cursor: pointer;
        text-align: left;
        background-color: transparent;
        font-family: var(--font-ui);
        color: var(--secondary-text);
        /* the heft the titles had in Fira Code at 500: Rubik's 500 is a step heavier */
        font-weight: 400;
        align-items: center;
    }
    /* the title's text a hair to the left, so it lines up with what is under it */
    .title-text {
        margin-left: -0.1rem;
    }
    .section {
        display: flex;
        flex-direction: column;
        gap: 0.8rem;
    }
    .sub-section-content {
        display: none;
        padding-left: 0.8rem;
        margin-left: 0.6rem;
        gap: 0.8rem;
        border-left: 3px solid var(--secondary);
        opacity: 0;
        &.open {
            display: flex;
            animation: fade-in var(--dur-base) forwards;
        }
    }

    /* open from the first paint, with no fade-in until the reader folds it */
    .sub-section-content.cantAnimate {
        animation: unset;
        &.open {
            opacity: 1;
        }
    }
    @keyframes fade-in {
        from {
            opacity: 0;
            transform: translateX(-1rem);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }
</style>
