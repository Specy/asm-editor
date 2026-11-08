import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vite-plus/test'
import { POPOVER_RADIUS_REM, POPOVER_SHADOW } from './elevation'

const tokens = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')

/** A token's value as `tokens.css` declares it on `:root`, the first declaration of the name. */
function token(name: string) {
    return tokens.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim()
}

describe('the Popover numbers PopoverOutline draws with', () => {
    it('are the corner of --r-overlay', () => {
        expect(token('--r-overlay')).toBe(`${POPOVER_RADIUS_REM}rem`)
    })

    it('are the shadow of --shadow-3, at 16px to the rem', () => {
        const { y, blur, opacity } = POPOVER_SHADOW
        expect(token('--shadow-3')).toBe(`0 ${y / 16}rem ${blur / 16}rem rgb(0 0 0 / ${opacity})`)
    })
})
