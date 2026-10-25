<script lang="ts">
    /**
     * Content cut to a height when it runs well past it, fading out over its last lines with a
     * Show all button low over the fade, which shows the rest; Show less, under the whole content,
     * cuts it back. Content that fits, or runs only a little past, shows whole with no button, and
     * printing always shows it whole. A caller that keeps whether it is open, like the Documentation
     * panel's open entries, passes `expanded` with `ontoggle`; otherwise it is kept here.
     */
    import { tick, type Snippet } from 'svelte'
    import { prefersReducedMotion } from 'svelte/motion'
    import FaChevronDown from '~icons/fa-solid/chevron-down'

    interface Props {
        /** Whether all of it shows. */
        expanded?: boolean
        /** Called by Show all and Show less, instead of `expanded` being flipped here. */
        ontoggle?: () => void
        /** The height it is cut to, in rem, the fade's included. */
        height?: number
        /** The height of the fade at the bottom of the cut content, in rem. */
        fade?: number
        /**
         * How far past `height` it may run and still show whole, in rem: a line or two hidden
         * behind a button saves nothing.
         */
        slack?: number
        /**
         * Brought into view by Show less, when the cut leaves it above the view: the content's
         * heading, where it has one. The top of the content otherwise.
         */
        anchor?: HTMLElement
        children: Snippet
    }

    let {
        expanded = $bindable(false),
        ontoggle,
        height = 9.5,
        fade = 2,
        slack = 3.5,
        anchor,
        children
    }: Props = $props()

    const id = $props.id()
    let natural = $state(0)
    let top = $state<HTMLElement>()

    //only measured in the browser, so the server never reads the root font size
    const long = $derived(natural > 0 && natural > (height + slack) * rootFontSize())

    function rootFontSize() {
        return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    }
    const clamped = $derived(long && !expanded)

    async function toggle() {
        const cutting = expanded
        if (ontoggle) ontoggle()
        else expanded = !expanded
        if (!cutting) return
        await tick()
        ;(anchor ?? top)?.scrollIntoView({
            block: 'nearest',
            behavior: prefersReducedMotion.current ? 'instant' : 'smooth'
        })
    }

    //a link inside the cut part reached with the keyboard would be focused out of sight
    function onfocusin(event: FocusEvent) {
        if (clamped && (event.target as Element).matches(':focus-visible')) void toggle()
    }
</script>

<div class="clamped-content" style:--fade={`${fade}rem`}>
    <span class="top" bind:this={top}></span>
    <div
        class="clip"
        class:clamped
        {id}
        style:max-height={long ? (expanded ? `${natural}px` : `${height}rem`) : undefined}
        {onfocusin}
    >
        <div bind:offsetHeight={natural}>
            {@render children()}
        </div>
    </div>
    {#if long}
        <button
            type="button"
            class="more"
            class:over={clamped}
            aria-expanded={expanded}
            aria-controls={id}
            onclick={toggle}
        >
            {expanded ? 'Show less' : 'Show all'}
            <span class="chevron" class:open={expanded} aria-hidden="true"><FaChevronDown /></span>
        </button>
    {/if}
</div>

<style lang="scss">
    .clamped-content {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        min-width: 0;
    }

    .top {
        display: block;
        height: 0;
        margin-bottom: -0.3rem;
    }

    /* the height slides between the cut and the whole content's measured height */
    .clip {
        overflow: hidden;
        min-width: 0;
        transition: max-height 0.25s ease;
    }

    /* mostly gone by its middle, so the text left behind the button does not compete with its label */
    .clamped {
        mask-image: linear-gradient(
            to bottom,
            #000 calc(100% - var(--fade)),
            rgb(0 0 0 / 0.2) calc(100% - var(--fade) / 2),
            transparent
        );
    }

    /* a pill, so it reads over the faded text it sits on */
    .more {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        align-self: center;
        padding: 0.3rem 0.85rem;
        border: 1px solid var(--wb-line, color-mix(in srgb, var(--tertiary) 70%, transparent));
        border-radius: 999px;
        background-color: var(--background);
        color: var(--accent);
        font: inherit;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;

        &:hover {
            background-color: color-mix(in srgb, var(--background), var(--background-text) 10%);
        }

        &:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: 2px;
        }
    }

    /* while cut, low over the fade */
    .over {
        position: absolute;
        left: 50%;
        bottom: calc(var(--fade) / 4);
        transform: translate(-50%, 50%);
        box-shadow: 0 0.25rem 0.75rem color-mix(in srgb, black 40%, transparent);
    }

    .chevron {
        display: flex;
        width: 0.65rem;
        height: 0.65rem;
        transition: transform 0.15s ease;

        &.open {
            transform: rotate(180deg);
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .clip,
        .chevron {
            transition: none;
        }
    }

    @media print {
        .clip {
            max-height: none !important;
            mask-image: none;
        }

        .more {
            display: none;
        }
    }
</style>
