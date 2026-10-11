import { describe, expect, it } from 'vite-plus/test'
import { zeroBasedLineToMonaco } from './monacoConversions'

describe('Monaco coordinate conversion', () => {
    it('maps source line zero to Monaco line one', () => {
        expect(zeroBasedLineToMonaco(0)).toBe(1)
    })
})
