<script lang="ts">
    /**
     * A Popover's surface drawn as one shape with its arrow: the shadow, the fill, the edge and, for
     * a translucent one, the blur of what is beneath it. It sits behind its Popover's content,
     * which draws no background or border of its own, and reaches past the Popover's box by the
     * arrow's size on every side, so the arrow can stand out of any edge. A box-shadow and border
     * would follow the box and miss the arrow; a separate arrow over a translucent card would show
     * a darker patch where the two overlap (the Tooltips design, decision 13).
     *
     * Its corner, shadow and arrow are the Popover's, `--r-overlay`, `--shadow-3` and
     * `POPOVER_ARROW` as numbers (`styles/elevation.ts`); its fill is the Popover's
     * (`styles/popover.scss`), and its edge is `--line`, which the Popover's content root redefines
     * (`popover.content`). A Popover with no arrow is drawn by CSS instead (`popover.surface`).
     */
    import { POPOVER_ARROW, popoverElevation, tooltipRadius } from '#src/styles/elevation.ts'
    import { outlinePath, type Side } from './floating'

    interface Props {
        width: number
        height: number
        /** The side of its target the Popover is on; no arrow when `at` is left out. */
        side: Side
        at?: number
        /** How far the arrow stands out, in pixels: a Popover's (`POPOVER_ARROW`) when left out. */
        arrow?: number
        /**
         * Opaque, as the Tooltip is, so that its text reads over a busy canvas; left out it is the
         * menus' translucent tint, which blurs what is beneath.
         */
        solid?: boolean
        /**
         * The corner: `overlay`, a menu's (`--r-overlay`), when left out; `control`, a control's
         * smaller one (`--r-control`), as the Tooltip and the hover cards over data have.
         */
        corner?: 'control' | 'overlay'
        /**
         * The corner in pixels, in place of `corner`, for the hover cards that still pass
         * `tooltipRadius()` or `popoverElevation().radius` themselves; `corner` names the same two.
         */
        radius?: number
    }

    let {
        width,
        height,
        side,
        at,
        arrow = POPOVER_ARROW,
        solid = false,
        corner = 'overlay',
        radius
    }: Props = $props()

    const id = $props.id()
    const { shadow } = popoverElevation()
    const rounding = $derived(
        radius ?? (corner === 'control' ? tooltipRadius() : popoverElevation().radius)
    )
    const size = $derived(at === undefined ? 0 : arrow)
    const shape = $derived({ radius: rounding, side, at: at ?? 0, arrow: size, offset: size })
    const path = $derived(outlinePath(width, height, shape))
    //the shadow's room past the outline on every side, so neither the mask nor the filter cuts it off
    const reach = shadow.y + shadow.blur * 3
    const region = $derived({
        x: -reach,
        y: -reach,
        width: width + (size + reach) * 2,
        height: height + (size + reach) * 2
    })
</script>

{#if width > 0 && height > 0}
    <div class="outline" style:inset="-{size}px" aria-hidden="true">
        {#if !solid}
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
                <clipPath id="{id}-inside">
                    <path d={path} />
                </clipPath>
            </defs>
            <g mask="url(#{id}-outside)">
                <path d={path} fill="#000" filter="url(#{id}-shadow)" />
            </g>
            <path d={path} class="fill" class:solid />
            <!-- the edge on the fill's own path, twice as wide and cut to the inside: its outer
                 edge is the fill's, curves and the arrow's tip included, as a CSS border's is -->
            <path
                d={path}
                style:stroke="var(--line)"
                stroke-width="2"
                fill="none"
                clip-path="url(#{id}-inside)"
            />
        </svg>
    </div>
{/if}

<style lang="scss">
    @use '../../../styles/popover.scss';

    .outline {
        position: absolute;
        z-index: -1;
        pointer-events: none;
    }

    .blur {
        position: absolute;
        inset: 0;
        backdrop-filter: popover.$blur;
    }

    .fill {
        fill: popover.$fill;
    }

    .fill.solid {
        fill: popover.$fill-solid;
    }

    svg {
        position: absolute;
        inset: 0;
        overflow: visible;
    }
</style>
