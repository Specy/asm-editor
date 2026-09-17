import { describe, expect, it } from 'vitest'
import { REGISTER_SIZES, sizeName, sizeNames } from '$lib/languages/sizeNames'
import { RegisterSize } from '$lib/languages/commonLanguageFeatures.svelte'
import { AVAILABLE_LANGUAGES } from '$lib/Project.svelte'

/**
 * The names each Target gives the widths the editor groups by. These are facts about the
 * architectures rather than about any component, so they are checked here and not through the size
 * strip that draws them.
 */
describe('sizeNames', () => {
    it('keeps the 68000 naming the enum was spelled from', () => {
        expect(sizeName(RegisterSize.Byte, 'M68K')).toEqual({ short: 'B', long: 'Byte' })
        expect(sizeName(RegisterSize.Word, 'M68K')).toEqual({ short: 'W', long: 'Word' })
        expect(sizeName(RegisterSize.Long, 'M68K')).toEqual({ short: 'L', long: 'Long' })
    })

    it('calls four bytes a word for MIPS and RISC-V, and two a halfword', () => {
        for (const language of ['MIPS', 'RISC-V', 'RISC-V-64'] as const) {
            expect(sizeName(RegisterSize.Byte, language).short).toBe('B')
            expect(sizeName(RegisterSize.Word, language)).toEqual({ short: 'H', long: 'Halfword' })
            expect(sizeName(RegisterSize.Long, language)).toEqual({ short: 'W', long: 'Word' })
            expect(sizeName(RegisterSize.Double, language)).toEqual({
                short: 'D',
                long: 'Doubleword'
            })
        }
    })

    it('uses the operand-size keywords x86 assemblers write', () => {
        expect(sizeName(RegisterSize.Word, 'X86')).toEqual({ short: 'W', long: 'Word' })
        expect(sizeName(RegisterSize.Long, 'X86')).toEqual({ short: 'D', long: 'Dword' })
        expect(sizeName(RegisterSize.Double, 'X86')).toEqual({ short: 'Q', long: 'Qword' })
        expect(sizeName(RegisterSize.Quad, 'X86')).toEqual({ short: 'X', long: 'Xmmword' })
    })

    it('spells the Z80 widths as the 68000 does', () => {
        expect(sizeName(RegisterSize.Byte, 'Z80')).toEqual(sizeName(RegisterSize.Byte, 'M68K'))
        expect(sizeName(RegisterSize.Word, 'Z80')).toEqual(sizeName(RegisterSize.Word, 'M68K'))
    })

    it('names every width for every Target, and never twice within one', () => {
        for (const language of AVAILABLE_LANGUAGES) {
            const names = REGISTER_SIZES.map((size) => sizeName(size, language))
            expect(names.every((name) => name.short.length > 0 && name.long.length > 0)).toBe(true)
            //a strip whose buttons repeat a letter cannot be read, whatever the letters are
            expect(new Set(names.map((name) => name.short)).size).toBe(REGISTER_SIZES.length)
            expect(new Set(names.map((name) => name.long)).size).toBe(REGISTER_SIZES.length)
        }
    })

    it('falls back to the 68000 naming with no Target to hand', () => {
        expect(sizeNames(undefined)).toEqual(sizeNames('M68K'))
        expect(sizeNames(null)).toEqual(sizeNames('M68K'))
    })

    it('shows a width no table covers as its own byte count', () => {
        expect(sizeName(3 as RegisterSize, 'MIPS')).toEqual({ short: '3', long: '3 bytes' })
    })
})
