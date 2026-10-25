/**
 * The Pixel editor's zoom ([pixel-editor-plan.md](../../../../../docs/design/pixel-editor-plan.md),
 * decision 8, revised 2026-10-25): any scale between {@link MIN_ZOOM} and {@link MAX_ZOOM}, which
 * the wheel and a pinch change smoothly and the buttons and keys by {@link ZOOM_FACTOR}.
 */

export const MIN_ZOOM = 1 / 8
export const MAX_ZOOM = 64
/** From this zoom up a line is drawn between every two pixels. */
export const PIXEL_GRID_ZOOM = 8
/** What a press of Zoom in or Zoom out, or of + or -, multiplies the zoom by: two make it double. */
export const ZOOM_FACTOR = Math.SQRT2
/** How much a pixel of Ctrl+wheel turning zooms: a mouse's notch about a third, a trackpad's pinch smoothly. */
const WHEEL_ZOOM = 0.003

/** `zoom` within {@link MIN_ZOOM} and {@link MAX_ZOOM}. */
export function clampZoom(zoom: number): number {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

/** The zoom that fits a picture in a pane, as large as fits. */
export function fitZoom(width: number, height: number, room: { width: number; height: number }) {
    return clampZoom(Math.min(room.width / width, room.height / height))
}

/** The zoom after the wheel turned `pixels` with Ctrl or Cmd held: out for a positive turn. */
export function wheelZoom(zoom: number, pixels: number): number {
    return clampZoom(zoom * Math.exp(-pixels * WHEEL_ZOOM))
}

/** How the status line says a zoom, as the Preview says its scale. */
export function zoomPercent(zoom: number): string {
    return `${Math.round(zoom * 100)}%`
}
