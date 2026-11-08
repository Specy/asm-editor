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
        children?: import('svelte').Snippet
    }

    let {
        open = $bindable(true),
        level = 2,
        style = '',
        sectionStyle = '',
        title,
        children
    }: Props = $props()
    let cantAnimate = $state(true)
    const id = $props.id()
</script>

<section class="section" class:open {style}>
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
            {@render title?.()}
        </button>
    </svelte:element>
    <div {id} class="column sub-section-content" class:open class:cantAnimate style={sectionStyle}>
        {@render children?.()}
    </div>
</section>

<style lang="scss">
    /* the button draws the title; the heading only names its level */
    .section-heading {
        margin: 0;
        font: inherit;
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
        font-weight: 700;
        align-items: center;
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

    .cantAnimate {
        animation: unset !important;
        &.open {
            opacity: 1;
            translate: translateX(0);
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
