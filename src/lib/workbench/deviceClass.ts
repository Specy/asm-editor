/**
 * Which arrangement of the Workbench a viewport gets ([the design record](../../../docs/design/workbench.md)):
 * phones and tablets follow the brief's compact layouts, everything wider is the desktop.
 */
export type DeviceClass = 'phone' | 'tablet' | 'desktop'

/** The widest phone, in CSS pixels. */
export const PHONE_MAX_WIDTH = 640
/** The widest tablet, in CSS pixels: the width at which the old project editor stacked its columns. */
export const TABLET_MAX_WIDTH = 1000

export const PHONE_QUERY = `(max-width: ${PHONE_MAX_WIDTH}px)`
export const TABLET_QUERY = `(max-width: ${TABLET_MAX_WIDTH}px)`
export const HOVER_QUERY = '(hover: hover)'

export function deviceClassFor(width: number): DeviceClass {
    if (width <= PHONE_MAX_WIDTH) return 'phone'
    if (width <= TABLET_MAX_WIDTH) return 'tablet'
    return 'desktop'
}

/**
 * Whether the Debug tools can be floating windows. They are desktop only, and a desktop-wide screen
 * whose pointer cannot hover (an iPad in landscape) cannot use them either: today's windows are
 * hidden on `(hover: none)`, so such a screen gets the sections whatever the Preference says.
 */
export function canFloat(deviceClass: DeviceClass, canHover: boolean): boolean {
    return deviceClass === 'desktop' && canHover
}
