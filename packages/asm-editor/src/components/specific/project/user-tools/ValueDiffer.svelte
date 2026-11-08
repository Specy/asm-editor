<script lang="ts">
    import PopoverOutline from '#cmp/shared/floating/PopoverOutline.svelte'
    import { elementSize } from '#cmp/shared/floating/elementSize.ts'
    import type { Side } from '#cmp/shared/floating/floating.ts'
    import { tooltipRadius } from '#src/styles/elevation.ts'
    import { boundedValueHover } from './boundedValueHover'

    interface Props {
        diff: string | number
        style?: string
        hoverElementStyle?: string
        value: string | number
        hoverValueElementStyle?: string //TODO rename
        hasSoftDiff?: boolean | undefined
        monospaced?: boolean
        /** Which side of the value its card opens on, where no `hoverBoundary` places it. */
        hoverSide?: 'above' | 'below'
        id?: string | undefined
        hoverValue?: import('svelte').Snippet
        hoverBoundary?: HTMLElement
    }

    let {
        diff,
        style = '',
        hoverElementStyle = '',
        hoverValueElementStyle = '',
        value,
        hasSoftDiff = undefined,
        monospaced = false,
        hoverSide = 'above',
        id = undefined,
        hoverValue,
        hoverBoundary
    }: Props = $props()

    /** The card's arrow, which stands out of it towards the value; ARROW in the styles below. */
    const ARROW = 6
    /** The Tooltip's corner, a control's, smaller than a menu's; --r-control in the styles below. */
    const RADIUS = tooltipRadius()
    let cardWidth = $state(0)
    let cardHeight = $state(0)
    /** Where `boundedValueHover` put the card: its side of the value and its arrow along it. */
    let placed = $state<{ side: Side; at?: number }>()
    //centred over or under the value when nothing bounds it, else where the bounds left it
    const outline = $derived(
        hoverBoundary
            ? placed
            : { side: (hoverSide === 'below' ? 'bottom' : 'top') as Side, at: cardWidth / 2 }
    )
</script>

<div
    style="position: relative;"
    use:boundedValueHover={{ boundary: hoverBoundary, onPlace: (place) => (placed = place) }}
>
    <div
        class="hover-element"
        class:bounded={!!hoverBoundary}
        class:below={!hoverBoundary && hoverSide === 'below'}
        style={hoverElementStyle}
        use:elementSize={(width, height) => {
            cardWidth = width
            cardHeight = height
        }}
    >
        {#if outline}
            <PopoverOutline
                width={cardWidth}
                height={cardHeight}
                side={outline.side}
                at={outline.at}
                arrow={ARROW}
                radius={RADIUS}
                solid
            />
        {/if}
        <div class="hover-content">
            {#if hoverValue}
                <div class:monospaced style={hoverValueElementStyle}>
                    {@render hoverValue?.()}
                </div>
            {/if}
            {#if diff !== value}
                <div class="old-value" class:monospaced role="tooltip">
                    {diff}
                </div>
            {/if}
        </div>
    </div>
    <div
        class:modified={diff !== value}
        class:softDiff={hasSoftDiff === true}
        class="tooltip-base"
        {id}
        class:monospaced
        {style}
    >
        {value}
    </div>
</div>

<style lang="scss">
    @use '../../../../styles/popover.scss';
    @use '../../../../styles/radius.scss' as *;

    .tooltip-base {
        display: flex;
        align-items: center;
        border-radius: 0.2rem;
        text-align: center;
        justify-content: center;
        cursor: default;
        text-align: center;
        opacity: 0.8;
    }

    .softDiff {
        background-color: var(--primary);
        color: var(--primary-text);
    }

    /* the room the card's arrow stands out of it by, ARROW in the script */
    $arrow: 6px;
    /* the card's room round what it holds, the same on every side (owner, 2026-11-08) */
    $pad: 0.3rem;

    /* a hover card over data, drawn as the Tooltip is: a solid Popover on the Tooltip's corner
       (RADIUS in the script), whose outline, arrow and all, is drawn behind it; the padding keeps
       the room its edge takes */
    .hover-element {
        @include popover.content;
        display: none;
        flex-direction: column;
        z-index: 3;
        position: absolute;
        cursor: text;
        text-align: center;
        padding: calc(#{$pad} + 1px);
    }

    /* centred over the value, or under it, its arrow's tip a pixel off it, however many lines
       it holds */
    .hover-element:not(.bounded) {
        bottom: calc(100% + 1px + #{$arrow});
        left: 50%;
        transform: translateX(-50%);

        &.below {
            top: calc(100% + 1px + #{$arrow});
            bottom: unset;
        }

        /* the gap to the value, which the pointer crosses to reach the card and stay on it */
        &::after {
            content: '';
            position: absolute;
            left: 0;
            right: 0;
            top: 100%;
            height: calc(1px + #{$arrow});
        }

        &.below::after {
            top: auto;
            bottom: 100%;
        }
    }

    /* its lines cut to the digits, from a capital's top to the baseline, so that the room the
       font leaves above and below them does not add to the padding there */
    .hover-content {
        text-box: trim-both cap alphabetic;
    }

    .old-value {
        color: var(--accent);
    }

    /* Fira Code at the size and weight of the register and memory views' values (MemoryRenderer's
       .memory-grid) */
    .monospaced {
        font-family: var(--font-mono);
        font-size-adjust: ex-height 0.49;
        font-variation-settings: 'wght' 400;
    }

    /* the hover tint (D4), over the cell's own fill when it has one */
    .tooltip-base:hover {
        background-image: linear-gradient(var(--hover-bg), var(--hover-bg));
    }

    .hover-element:not(.bounded):has(~ .tooltip-base:hover),
    .hover-element:not(.bounded):hover,
    .hover-element:global(.shown) {
        display: flex;
    }

    /* its room inside what scrolls, which a row running from edge to edge (the memory view's
       region) reaches over */
    .bounded {
        width: max-content;
        padding: 1px;

        .hover-content {
            max-height: var(--hover-max-height);
            overflow: auto;
            padding: $pad;
            border-radius: nested-radius(var(--r-control), $border: 1px);
        }
    }

    .modified {
        background-color: var(--accent);
        color: var(--accent-text);
        cursor: pointer;
    }
</style>
