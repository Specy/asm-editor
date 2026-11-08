/**
 * The Popover's corner, shadow and arrow as numbers, for `PopoverOutline`, which draws them in
 * SVG with its arrow where CSS cannot reach, and for the scripts that place a Popover by hand
 * (design-system.md, D3 and D13; design-system-plan.md, planning decision 4). They are
 * `--r-overlay` and `--shadow-3` in `tokens.css`, which a Popover drawn by CSS reads, and `$arrow`
 * in `styles/popover.scss`, which the hover cards placed by CSS read; `elevation.test.ts` holds
 * them to the same values. A Tooltip's outline is a Popover's on a control's corner,
 * `--r-control`, which the test holds too.
 */
import { rootFontSize } from './rem'

/** A Popover's corner, `--r-overlay`, in rem. */
export const POPOVER_RADIUS_REM = 0.6

/**
 * A Tooltip's corner, `--r-control`, in rem: a control's rather than a menu's, the small corner
 * the Tooltip always had (owner, 2026-11-08). The rest of its outline is a Popover's.
 */
export const TOOLTIP_RADIUS_REM = 0.4

/** A Popover's shadow, `--shadow-3`: its drop and softness in pixels at a 16px root, and its opacity. */
export const POPOVER_SHADOW = { y: 8, blur: 24, opacity: 0.35 } as const

/**
 * How far a Popover's arrow stands out of its edge, in pixels, which is also half its base: the
 * Tooltip's, the menus', the hover cards'. `$arrow` in `styles/popover.scss`.
 */
export const POPOVER_ARROW = 6

/**
 * A Popover's corner and shadow in pixels at the root's font size, as `tokens.css`'s rem are, so
 * that the outline's corner and the `nested-radius()` of the rows inside it are worked out from
 * the same length.
 */
export function popoverElevation() {
    const rem = rootFontSize()
    return {
        radius: POPOVER_RADIUS_REM * rem,
        shadow: {
            y: (POPOVER_SHADOW.y / 16) * rem,
            blur: (POPOVER_SHADOW.blur / 16) * rem,
            opacity: POPOVER_SHADOW.opacity
        }
    }
}

/** A Tooltip's corner in pixels at the root's font size, for its outline and its arrow's room. */
export function tooltipRadius(): number {
    return TOOLTIP_RADIUS_REM * rootFontSize()
}
