<script lang="ts">
    /**
     * A titled section that folds away, remembering whether it is folded (per person, in the layout
     * store): the Settings panel's sections, the Screen and the Debug tools in the debug column, and
     * the rows of the compact layouts.
     */
    import { tick, untrack, type Snippet } from 'svelte'
    import FaAngleRight from '~icons/fa-solid/angle-right'
    import { workbenchLayout } from '$stores/workbenchLayoutStore.svelte'

    interface Props {
        /** Where the folded state is remembered. */
        id: string
        title: string
        defaultCollapsed?: boolean
        /** Read-only detail beside the title, like the Screen's size. */
        info?: Snippet
        /** Controls of the section's own at the right of its header. */
        actions?: Snippet
        children: Snippet
        /** Let the body take the room left in a column. */
        fill?: boolean
        /**
         * `card` sits on the panel's surface, like the debug column's sections; `outlined` sits on
         * the page's background, framed by its header's colour, like the Settings sections.
         */
        variant?: 'card' | 'outlined'
        style?: string
        bodyStyle?: string
        element?: HTMLElement
    }

    let {
        id,
        title,
        defaultCollapsed = false,
        info,
        actions,
        children,
        fill = false,
        variant = 'card',
        style = '',
        bodyStyle = '',
        element = $bindable()
    }: Props = $props()

    const collapsed = $derived(workbenchLayout.isCollapsed(id, defaultCollapsed))
    //the body is built the first time the section opens and only hidden after that, so opening it
    //again shows what is there instead of building it anew
    let opened = false
    const mounted = $derived.by(() => {
        if (!collapsed) opened = true
        return opened
    })

    //whether the body is unfolded, which slides it open and shut. A body built by this opening is
    //laid out folded once first, so that it has somewhere to slide open from
    let fold: HTMLDivElement | undefined = $state()
    let shown = $state(untrack(() => !collapsed))
    //whether the body is in the middle of a slide, which keeps a body that scrolls from showing a
    //scrollbar while its row is too short for it, when it may well fit once the slide is over
    let sliding = $state(false)
    $effect(() => {
        if (collapsed) {
            if (untrack(() => shown)) sliding = true
            shown = false
            return
        }
        if (fold && !untrack(() => shown)) {
            fold.getBoundingClientRect()
            sliding = true
        }
        shown = true
    })
    //the slide is over once the fold's transitions finish; with none, as with reduced motion, it is
    //over at once. A slide turned back halfway is followed by the one that turned it
    let slide = 0
    $effect(() => {
        void shown
        if (!fold || !untrack(() => sliding)) return
        const current = ++slide
        const element = fold
        //the transitions start once the fold's classes change, which can be after this effect
        void tick()
            .then(() =>
                Promise.all(
                    (element.getAnimations?.() ?? []).map((transition) => transition.finished)
                )
            )
            .then(
                () => {
                    if (current === slide) sliding = false
                },
                () => {}
            )
    })
</script>

<section
    class="collapsible"
    class:collapsed
    class:fill
    class:outlined={variant === 'outlined'}
    {style}
    bind:this={element}
>
    <div class="section-header">
        <button
            class="toggle"
            aria-expanded={!collapsed}
            onclick={() => workbenchLayout.setCollapsed(id, !collapsed)}
        >
            <span class="chevron" class:open={!collapsed}><FaAngleRight /></span>
            <span class="ellipsis">{title}</span>
            {#if info}
                <span class="info">{@render info()}</span>
            {/if}
        </button>
        {#if actions}
            <div class="actions">{@render actions()}</div>
        {/if}
    </div>
    {#if mounted}
        <div class="body-fold" class:shown class:sliding bind:this={fold}>
            <div class="body-clip">
                <div class="section-body" style={bodyStyle}>
                    {@render children()}
                </div>
            </div>
        </div>
    {/if}
</section>

<style lang="scss">
    .collapsible {
        display: flex;
        flex-direction: column;
        /* a section in a column that overflows keeps its height and the column scrolls; hidden
           overflow would otherwise let it shrink to nothing */
        flex-shrink: 0;
        min-width: 0;
        background-color: var(--wb-surface, var(--secondary));
        color: var(--secondary-text);
        border-radius: var(--wb-radius, 0.4rem);
        border: var(--wb-card-edge, none);
        border-bottom: var(--wb-section-rule, none);
        overflow: hidden;
    }

    .outlined {
        background-color: var(--background);
        border: 1px solid var(--wb-section-header, var(--tertiary));
        border-radius: 0.4rem;
    }

    .fill:not(.collapsed) {
        flex: 1;
        min-height: 0;
    }

    /* the header is a band a shade lighter than what it sits on, across the section's whole width,
       so the eye reads it as the handle of a section and not as a line of text */
    .section-header {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        flex: none;
        min-height: 2.25rem;
        background-color: var(--wb-section-header, var(--tertiary));
    }

    .toggle {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex: 1;
        min-width: 0;
        align-self: stretch;
        padding: 0 0.7rem;
        background: transparent;
        color: inherit;
        font-weight: bold;
        font-size: 0.85rem;
        text-align: left;
        cursor: pointer;

        &:hover {
            background-color: color-mix(in srgb, var(--tertiary) 35%, transparent);
        }
    }

    .chevron {
        display: grid;
        place-items: center;
        flex: none;
        width: 0.8rem;
        height: 0.8rem;
        opacity: 0.7;
        transition: transform 0.15s;

        &.open {
            transform: rotate(90deg);
        }
    }

    .info,
    .actions {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        flex: none;
        font-size: 0.8rem;
    }

    /* the toggle runs to the header's right end, so only controls keep some room from it */
    .actions {
        padding-right: 0.4rem;
    }

    /* beside the title, inside the toggle, and read as a detail of it */
    .info {
        font-weight: normal;
        color: var(--hint);
    }

    /* the body folds through its grid row, from 0fr to 1fr, which slides it open and shut; folded
       it is hidden once the slide is over, so nothing in it can take the focus */
    .body-fold {
        display: grid;
        grid-template-rows: 0fr;
        min-height: 0;
        visibility: hidden;
        transition:
            grid-template-rows 0.2s ease,
            visibility 0s 0.2s;

        &.shown {
            grid-template-rows: 1fr;
            visibility: visible;
            transition:
                grid-template-rows 0.2s ease,
                visibility 0s;
        }

        @media (prefers-reduced-motion: reduce) {
            transition: none;

            &.shown {
                transition: none;
            }
        }
    }

    /* the row's one item, clipped so that it can be shorter than what it holds */
    .body-clip {
        display: flex;
        flex-direction: column;
        min-height: 0;
        overflow: hidden;
    }

    .section-body {
        display: flex;
        flex-direction: column;
        min-height: 0;
        min-width: 0;
    }

    /* while it slides the body keeps the height it will have once open and the fold clips it,
       instead of being squeezed by the row: neither it, through its bodyStyle, nor anything that
       scrolls inside it, like the History's list, shows a scrollbar that comes and goes and
       narrows what it holds on the way. A body that fills its column grows with the row as before */
    .sliding .section-body {
        flex-shrink: 0;
        overflow: hidden !important;
    }

    .fill .body-fold {
        flex: 1;
    }

    .fill .section-body {
        flex: 1;
    }
</style>
