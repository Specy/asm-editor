import { describe, expect, it } from 'vite-plus/test'
import { sassVariable, token } from './tokens.testing'
import { POPOVER_ARROW, POPOVER_RADIUS_REM, POPOVER_SHADOW, TOOLTIP_RADIUS_REM } from './elevation'

describe('the Popover numbers PopoverOutline draws with', () => {
    it('are the corner of --r-overlay', () => {
        expect(token('--r-overlay')).toBe(`${POPOVER_RADIUS_REM}rem`)
    })

    it('are the shadow of --shadow-3, at 16px to the rem', () => {
        const { y, blur, opacity } = POPOVER_SHADOW
        expect(token('--shadow-3')).toBe(`0 ${y / 16}rem ${blur / 16}rem rgb(0 0 0 / ${opacity})`)
    })

    it('are, for a Tooltip, the corner of --r-control', () => {
        expect(token('--r-control')).toBe(`${TOOLTIP_RADIUS_REM}rem`)
    })

    it('are the arrow the hover cards placed by CSS leave room for, popover.scss $arrow', () => {
        expect(sassVariable('popover.scss', 'arrow')).toBe(`${POPOVER_ARROW}px`)
    })
})
