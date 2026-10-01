import { describe, expect, it } from 'vitest'
import { plainText, registerRange, summaryOf } from './entries'

describe('plainText', () => {
    it('drops the markdown and keeps the words', () => {
        expect(plainText('**Ready** is _set_ by *the* device; see [movea](/x).')).toBe(
            'Ready is set by the device; see movea.'
        )
        expect(plainText('> A note\n- an item\n* another')).toBe('A note an item another')
    })

    it('keeps the underscores and stars inside names', () => {
        expect(plainText('`exit_group` takes o_stat in `rsi`')).toBe(
            'exit_group takes o_stat in rsi'
        )
        expect(plainText('a*b and a_b_c')).toBe('a*b and a_b_c')
    })
})

describe('summaryOf', () => {
    it('reads past an e.g. to the end of the sentence', () => {
        expect(summaryOf('A register, e.g. `a`, holds a byte. More text.')).toBe(
            'A register, e.g. a, holds a byte.'
        )
    })
})

describe('registerRange', () => {
    it('names every register of a range', () => {
        expect(registerRange('$t0 - $t3')).toEqual(['$t0', '$t1', '$t2', '$t3'])
        expect(registerRange('$8 - $10')).toEqual(['$8', '$9', '$10'])
        expect(registerRange('ra')).toEqual(['ra'])
    })
})
