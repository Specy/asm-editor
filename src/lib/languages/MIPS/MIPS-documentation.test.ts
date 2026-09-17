import { describe, expect, it } from 'vitest'
import { mipsRegisterFiles } from './MIPS-documentation'

/**
 * The coprocessor prose makes claims a reader will act on, and this MARS fork is the authority on
 * every one of them: it has no `li.s`, it takes exceptions but never delivers an interrupt, and a
 * floating point comparison writes a condition flag rather than a register. Those facts are pinned
 * here so a rewrite of the prose cannot quietly promise something the simulator does not do.
 */
describe('the MIPS register files', () => {
    const files = new Map(mipsRegisterFiles.map((file) => [file.id, file]))

    it('describes the two the page shows beside the general registers', () => {
        expect(mipsRegisterFiles.map((file) => file.id)).toEqual(['fpu', 'cp0'])
    })

    it('does not promise the load immediate this fork has no pseudo-instruction for', () => {
        const fpu = files.get('fpu')!
        // The ways in are `l.s`/`l.d` from a `.float`/`.double` and `mtc1` of a bit pattern.
        expect(fpu.intro).toContain('no `li.s` or `li.d`')
        expect(fpu.intro).toContain('mtc1')
        expect(fpu.intro).toContain('mfc1')
    })

    it('gives both forms of a floating point comparison and the branch that reads each', () => {
        const flags = files
            .get('fpu')!
            .registers.find((register) => register.name === 'Condition flags')!
        // "c.lt.s $f0, $f2" writes flag 0; "c.lt.s 3, $f0, $f2" writes flag 3, and the branches
        // take the flag number the same way.
        expect(flags.description).toContain('`c.lt.s $f0, $f2`')
        expect(flags.description).toContain('`c.lt.s 3, $f0, $f2`')
        expect(flags.description).toContain('`bc1t 3, label`')
    })

    it('names both sides of the coprocessor 0 move', () => {
        const cp0 = files.get('cp0')!
        // Both exist in this MARS, so a handler can write the registers back, not only read them.
        expect(cp0.intro).toContain('mfc0')
        expect(cp0.intro).toContain('mtc0')
    })

    it('says the simulator raises exceptions and never an interrupt', () => {
        const cp0 = files.get('cp0')!
        const status = cp0.registers.find((register) => register.name === '$12 (status)')!
        // Nothing in the fork sets an interrupting device, so the mask and the enable bit are
        // state and nothing more; the bit the simulator itself writes is the exception level.
        expect(cp0.intro).toContain('nothing in it delivers an interrupt')
        expect(status.description).toContain('exception level')
        expect(status.description).toContain('`eret`')
    })

    it('explains every register it lists', () => {
        for (const file of mipsRegisterFiles) {
            expect(file.intro.length, file.id).toBeGreaterThan(100)
            for (const register of file.registers) {
                expect(register.description.length, register.name).toBeGreaterThan(60)
            }
        }
    })
})
