<script lang="ts">
    /**
     * A card's surface drawn as one shape with its arrow: the shadow, the fill, the border and, for
     * a translucent card, the blur of what is beneath it. It sits behind its card's content, which
     * draws no background or border of its own, and reaches past the card's box by the arrow's size
     * on every side, so the arrow can stand out of any edge. A card's box-shadow and border would
     * follow the box and miss the arrow; a separate arrow over a translucent card would show a darker
     * patch where the two overlap (the Tooltips design, decision 13).
     */
    import { outlinePath, type Side } from './floating'

    interface Props {
        width: number
        height: number
        radius: number
        /** The side of its target the card is on; no arrow when `at` is left out. */
        side: Side
        at?: number
        arrow: number
        fill: string
        stroke: string
        /** Blurs what is beneath it, for a translucent `fill`. */
        blur?: boolean
        /** The shadow's drop and softness, in pixels, and its opacity. */
        shadow: { y: number; blur: number; opacity: number }
    }

    let {
        width,
        height,
        radius,
        side,
        at,
        arrow,
        fill,
        stroke,
        blur = false,
        shadow
    }: Props = $props()

    const id = $props.id()
    const size = $derived(at === undefined ? 0 : arrow)
    const shape = $derived({ radius, side, at: at ?? 0, arrow: size, offset: size })
    const path = $derived(outlinePath(width, height, shape))
    const border = $derived(outlinePath(width, height, { ...shape, inset: 0.5 }))
    //the shadow's room past the outline on every side, so neither the mask nor the filter cuts it off
    const reach = $derived(shadow.y + shadow.blur * 3)
    const region = $derived({
        x: -reach,
        y: -reach,
        width: width + (size + reach) * 2,
        height: height + (size + reach) * 2
    })
</script>

{#if width > 0 && height > 0}
    <div class="outline" style:inset="-{size}px" aria-hidden="true">
        {#if blur}
            <div class="blur" style:clip-path="path('{path}')"></div>
        {/if}
        <svg width={width + size * 2} height={height + size * 2}>
            <defs>
                <filter id="{id}-shadow" filterUnits="userSpaceOnUse" {...region}>
                    <feDropShadow
                        dx="0"
                        dy={shadow.y}
                        stdDeviation={shadow.blur / 2}
                        flood-color="#000"
                        flood-opacity={shadow.opacity}
                    />
                </filter>
                <!-- the shadow outside the shape only, so a translucent fill does not show it -->
                <mask id="{id}-outside" maskUnits="userSpaceOnUse" {...region}>
                    <rect {...region} fill="#fff" />
                    <path d={path} fill="#000" />
                </mask>
            </defs>
            <g mask="url(#{id}-outside)">
                <path d={path} fill="#000" filter="url(#{id}-shadow)" />
            </g>
            <path d={path} style:fill />
            <path d={border} style:stroke stroke-width="1" fill="none" />
        </svg>
    </div>
{/if}

<style lang="scss">
    .outline {
        position: absolute;
        z-index: -1;
        pointer-events: none;
    }

    .blur {
        position: absolute;
        inset: 0;
        backdrop-filter: blur(4px);
    }

    svg {
        position: absolute;
        inset: 0;
        overflow: visible;
    }
</style>
