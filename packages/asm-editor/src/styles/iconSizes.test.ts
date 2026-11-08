import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vite-plus/test'
import { ICON_STEPS, iconLength } from './iconSizes'

const tokens = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')

/** A token's value as `tokens.css` declares it on `:root`, the first declaration of the name. */
function token(name: string) {
    return tokens.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim()
}

describe('the icon sizes', () => {
    it('are the type scale steps tokens.css declares on :root', () => {
        for (const [step, length] of Object.entries(ICON_STEPS)) {
            expect(token(`--fs-${step}`), step).toBe(length)
        }
    })

    it('draw an em icon at the size of the text round it', () => {
        expect(iconLength('em')).toBe('1em')
        expect(iconLength('small')).toBe('0.85rem')
    })
})
