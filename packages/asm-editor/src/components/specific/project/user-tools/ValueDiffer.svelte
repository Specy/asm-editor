<script lang="ts">
    import PopoverOutline from '#cmp/shared/floating/PopoverOutline.svelte'
    import { elementSize } from '#cmp/shared/floating/elementSize.ts'
    import type { Side } from '#cmp/shared/floating/floating.ts'
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

    /* a hover card over data, drawn as the Tooltip is: a solid Popover whose outline, arrow and
       all, is drawn behind it; the padding keeps the room its edge takes */
    .hover-element {
        @include popover.content;
        display: none;
        flex-direction: column;
        z-index: 3;
        position: absolute;
        cursor: text;
        text-align: center;
        padding: calc(0.2rem + 1px);
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

    .old-value {
        color: var(--accent);
    }

    .monospaced {
        font-family: var(--font-mono);
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

    .bounded {
        width: max-content;
        padding: 1px;

        .hover-content {
            max-height: var(--hover-max-height);
            overflow: auto;
            border-radius: nested-radius(var(--r-overlay), $border: 1px);
        }

        .old-value {
            padding: 0 0.3rem 0.2rem;
        }
    }

    .modified {
        background-color: var(--accent);
        color: var(--accent-text);
        cursor: pointer;
    }
</style>
