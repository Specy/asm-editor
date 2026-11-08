/**
 * Motion for what moves through script rather than a stylesheet (design-system-plan.md, stage 3
 * item 11): Svelte runs its transitions through `element.animate()`, which the reduced-motion rule
 * in `global.css` cannot reach, and a Tooltip animates itself the same way. The durations and the
 * easing are `--dur-fast`, `--dur-base` and `--ease-out` in `tokens.css` (D13), which
 * `motion.test.ts` holds them to.
 */
import { MediaQuery } from 'svelte/reactivity'

/** `--dur-fast`: hover and press, a Tooltip appearing. */
export const DUR_FAST = 120

/** `--dur-base`: a Tray or a Popover opening and closing. */
export const DUR_BASE = 160

/** `--ease-out`, Svelte's `cubicOut` as a timing function, for `element.animate()`. */
export const EASE_OUT = 'cubic-bezier(0.33, 1, 0.68, 1)'

/*
 * The query `svelte/motion`'s `prefersReducedMotion` is, made the first time it is asked rather
 * than as the module loads: that one reads `window.matchMedia` on import, which jsdom lacks, so
 * every component with a transition would need a stub before its test could even import it.
 */
let reducedMotionQuery: MediaQuery | undefined

/** Whether the system asks for less motion; false where there is no window to ask. */
export function prefersLessMotion(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    reducedMotionQuery ??= new MediaQuery('(prefers-reduced-motion: reduce)')
    return reducedMotionQuery.current
}

/**
 * A transition's duration or delay, or 0 when the system asks for less motion, so that what a
 * transition shows and hides comes and goes at once. A transition of 0 still runs, and still
 * fires `introend` and `outroend`.
 */
export function motion(duration: number): number {
    return prefersLessMotion() ? 0 : duration
}
