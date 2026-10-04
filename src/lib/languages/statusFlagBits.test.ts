import { describe, expect, it } from 'vitest'
import { ccrToFlagsArray } from '@specy/s68k'
import { statusFlagsFromBits } from './statusFlagBits'
import { Z80_FLAGS } from './Z80/Z80-model'

describe('status flags read from a recorded status word', () => {
    it("read s68k's CCR exactly as its own decoder does, in X N Z V C order", () => {
        for (let bits = 0; bits < 64; bits++) {
            const expected = ccrToFlagsArray(bits)
                .reverse()
                .map((flag) => flag === 1)
            expect(statusFlagsFromBits('M68K', bits)).toEqual(expected)
        }
    })

    it("read x86's EFLAGS by architectural bit, in the panel's CF PF AF ZF SF TF DF OF order", () => {
        // CF (bit 0), PF (bit 2) and ZF (bit 6)
        expect(statusFlagsFromBits('X86', 0x45)).toEqual([
            true,
            true,
            false,
            true,
            false,
            false,
            false,
            false
        ])
        // OF (bit 11) and SF (bit 7), with the reserved bit 1 that hardware always sets ignored
        expect(statusFlagsFromBits('X86', 0x882)).toEqual([
            false,
            false,
            false,
            false,
            true,
            false,
            false,
            true
        ])
    })

    it("read Z80's F register through the model's own bit table", () => {
        for (const flag of Z80_FLAGS) {
            const flags = statusFlagsFromBits('Z80', 1 << flag.bit)
            expect(flags.filter(Boolean)).toHaveLength(1)
            expect(flags[Z80_FLAGS.indexOf(flag)]).toBe(true)
        }
    })

    it('have nothing to read for MIPS and RISC-V', () => {
        for (const language of ['MIPS', 'RISC-V', 'RISC-V-64'] as const) {
            expect(statusFlagsFromBits(language, 0xffffffff)).toEqual([])
        }
    })
})
