import { describe, expect, it } from 'vitest'
import { canFloat, deviceClassFor, PHONE_MAX_WIDTH, TABLET_MAX_WIDTH } from './deviceClass'

describe('deviceClassFor', () => {
    it('puts each width in the arrangement the brief drew for it', () => {
        expect(deviceClassFor(390)).toBe('phone')
        expect(deviceClassFor(PHONE_MAX_WIDTH)).toBe('phone')
        expect(deviceClassFor(PHONE_MAX_WIDTH + 1)).toBe('tablet')
        expect(deviceClassFor(834)).toBe('tablet')
        expect(deviceClassFor(TABLET_MAX_WIDTH)).toBe('tablet')
        expect(deviceClassFor(TABLET_MAX_WIDTH + 1)).toBe('desktop')
        expect(deviceClassFor(1920)).toBe('desktop')
    })
})

describe('canFloat', () => {
    it('allows floating windows only on a desktop with a pointer that hovers', () => {
        expect(canFloat('desktop', true)).toBe(true)
        //an iPad in landscape: desktop wide, but nothing to drag the windows with
        expect(canFloat('desktop', false)).toBe(false)
        expect(canFloat('tablet', true)).toBe(false)
        expect(canFloat('phone', true)).toBe(false)
    })
})
