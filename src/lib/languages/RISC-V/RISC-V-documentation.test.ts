import { describe, expect, it } from 'vitest'
import { riscvRegisterFiles } from './RISC-V-documentation'

/**
 * The register prose names instructions a reader is expected to type, and an operand in the wrong
 * order assembles to nothing. RARS is the authority: the expansions asserted here are the ones in
 * its PseudoOps.java, so a rewrite of the prose cannot quietly reintroduce a line the assembler
 * rejects. The prose also states facts about the architecture that are easy to invent, such as why
 * the saved register names run out of order, so those are pinned here too.
 */
describe('the RISC-V register files', () => {
    const files = new Map(riscvRegisterFiles.map((file) => [file.id, file]))

    it('describes the three the page and the registers panel show', () => {
        expect(riscvRegisterFiles.map((file) => file.id)).toEqual([
            'general-registers',
            'fpu',
            'csr'
        ])
    })

    it('spells the CSR accesses with the general register first', () => {
        const csr = files.get('csr')!
        // "csrw t1, fcsr" in RARS, so the CSR never comes first in csrr or csrw.
        expect(csr.intro).toContain('csrw t0, fcsr')
        expect(csr.intro).toContain('csrr t0, fcsr')
        expect(csr.intro).not.toContain('csrw fcsr, t0')
    })

    it('names both halves of the fmv pair', () => {
        const fpu = files.get('fpu')!
        // fmv.x.w only moves a float register into an integer one; fmv.w.x is the way back.
        expect(fpu.intro).toContain('fmv.x.w')
        expect(fpu.intro).toContain('fmv.w.x')
    })

    it('gives the compressed encoding as the reason the saved names run out of order', () => {
        const fpu = files.get('fpu')!
        const saved = fpu.registers.find((register) => register.name === 'fs2 - fs11')!
        // The three bit register field of the RVC instructions reaches f8 to f15, which is fs0,
        // fs1 and fa0 to fa5 and no further, which is why the rest of the saved ones start at f18.
        expect(saved.description).toContain('compressed')
        expect(saved.description).toContain('`f8` to `f15`')
        expect(saved.description).toContain('`fs0`, `fs1` and `fa0` to `fa5`')
    })

    it('explains every register it lists', () => {
        for (const file of riscvRegisterFiles) {
            expect(file.intro.length, file.id).toBeGreaterThan(100)
            for (const register of file.registers) {
                expect(register.description.length, register.name).toBeGreaterThan(60)
            }
        }
    })
})
