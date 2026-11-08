/**
 * How `Button` and `ButtonLink` are drawn. A button takes a role (design-system.md, D5): `primary`,
 * the one action that moves things on, filled with the accent; `secondary`, any other action
 * beside it, in a field's fill and text (styles/field.scss), as a Select is (owner, 2026-11-08);
 * and `ghost`, a label that only takes the surface's hover tint, for toolbars and Trays. It comes
 * in two sizes, `md` and the compact `sm`.
 */
export type ButtonKind = 'primary' | 'secondary' | 'ghost'

export type ButtonSize = 'sm' | 'md'

/**
 * The look of every role, its radius, padding, weight and hover, which the owner left open after
 * the landing redesign (D5): one switch, so the whole app can move to another look at once.
 * `workbench`, the Workbench's, is the only one so far: compact, medium weight, lightened on hover.
 */
export type ButtonVariant = 'workbench'

export const DEFAULT_BUTTON_VARIANT: ButtonVariant = 'workbench'

/**
 * The inline style of a button whose fill or text is data rather than a role's: a language's
 * accent, a theme's own colour (planning decision 7). Each is left to the role when not given.
 */
export function dataColours(bg: string | undefined, color: string | undefined, style: string) {
    return `${bg ? `--btn-color: ${bg};` : ''}${color ? `--btn-text: ${color};` : ''}${style}`
}
