/**
 * An icon's size (`Icon`'s `size`): a step of the type scale (design-system.md, D11), so an icon is
 * as big as a line of text in that step, or `em`, the size of the text it sits in. `small`, `body`
 * and `lead` are the audit's sm, md and lg; the steps below them are for the marks inside small
 * controls, the ones above for the marks that stand alone. A step is its size as `tokens.css`
 * declares it on `:root`, before the phones' step down and a reading page's step up, which an
 * interface's icons do not follow (iconSizes.test.ts holds the two together).
 */
export type IconSize = keyof typeof ICON_STEPS | 'em'

export const ICON_STEPS = {
    micro: '0.65rem',
    caption: '0.75rem',
    small: '0.85rem',
    body: '1rem',
    prose: '1.1rem',
    lead: '1.2rem',
    h3: '1.4rem',
    h2: '1.8rem',
    h1: '2.75rem'
} as const

/** The length an icon of that size is drawn at. */
export function iconLength(size: IconSize): string {
    return size === 'em' ? '1em' : ICON_STEPS[size]
}
