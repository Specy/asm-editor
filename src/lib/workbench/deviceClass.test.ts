import { describe, expect, it } from 'vitest'
import { canFloat } from './deviceClass'

describe('canFloat', () => {
    it('allows floating windows only on a desktop with a pointer that hovers', () => {
        expect(canFloat('desktop', true)).toBe(true)
        //an iPad in landscape: desktop wide, but nothing to drag the windows with
        expect(canFloat('desktop', false)).toBe(false)
        expect(canFloat('tablet', true)).toBe(false)
        expect(canFloat('phone', true)).toBe(false)
    })
})
