import type { Snippet } from 'svelte'

/**
 * What the Screen panel shows in its header, handed to a container that draws the header itself:
 * the Screen's size, and the controls (the display configuration, the drawing buffer, the zoom and
 * the floating window).
 */
export interface ScreenHeader {
    info: Snippet
    actions: Snippet
}
