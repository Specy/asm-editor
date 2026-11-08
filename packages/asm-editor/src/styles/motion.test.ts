import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vite-plus/test'
import { DUR_BASE, DUR_FAST, EASE_OUT } from './motion'

const tokens = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')

/** A token's value as `tokens.css` declares it on `:root`, the first declaration of the name. */
function token(name: string) {
    return tokens.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim()
}

describe('the motion numbers scripts animate with', () => {
    it('are the durations of --dur-fast and --dur-base', () => {
        expect(token('--dur-fast')).toBe(`${DUR_FAST}ms`)
        expect(token('--dur-base')).toBe(`${DUR_BASE}ms`)
    })

    it('are the easing of --ease-out', () => {
        expect(token('--ease-out')).toBe(EASE_OUT)
    })
})
