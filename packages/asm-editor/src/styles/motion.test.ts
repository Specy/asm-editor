import { describe, expect, it } from 'vite-plus/test'
import { token } from './tokens.testing'
import { DUR_BASE, DUR_FAST, EASE_OUT } from './motion'

describe('the motion numbers scripts animate with', () => {
    it('are the durations of --dur-fast and --dur-base', () => {
        expect(token('--dur-fast')).toBe(`${DUR_FAST}ms`)
        expect(token('--dur-base')).toBe(`${DUR_BASE}ms`)
    })

    it('are the easing of --ease-out', () => {
        expect(token('--ease-out')).toBe(EASE_OUT)
    })
})
