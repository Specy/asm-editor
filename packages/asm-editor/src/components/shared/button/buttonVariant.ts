/**
 * How `Button` and `ButtonLink` are drawn. `classic` is the app's look from before the Workbench:
 * roomy, brightened on hover. `workbench` is the Workbench's: a little more compact and medium
 * weight, lightened on hover, and with the `bordered` prop the 1px edge of a Workbench card. A
 * button chooses with its `variant` prop; without one it takes the default below, so the whole app
 * can be switched at once while the look is iterated on.
 */
export type ButtonVariant = 'classic' | 'workbench'

export const DEFAULT_BUTTON_VARIANT: ButtonVariant = 'workbench'

const SURFACES = ['primary', 'secondary', 'tertiary', 'background']

/**
 * Whether a button is coloured as a surface, like a card, rather than filled with an accent: the
 * `workbench` look then lightens it toward `--tertiary` on hover.
 */
export function isSurfaceButton(cssVar: string, bg: string): boolean {
    return SURFACES.includes(cssVar) || SURFACES.some((name) => bg === `var(--${name})`)
}
