import { describe, expect, it } from 'vitest'
import { MIPS } from '@specy/mips'
import { RISCV } from '@specy/risc-v'
import { mipsDirectivesMap } from '$lib/languages/MIPS/MIPS-documentation'
import { riscvDirectivesMap } from '$lib/languages/RISC-V/RISC-V-documentation'

/**
 * The directive maps are written by hand, while the directives themselves live in the Cores, and
 * nothing connects the two: the Cores do not expose their directive list to JavaScript the way they
 * expose their instruction set. So the maps can drift, and did — `.org` and `.ltorg` were documented
 * for years without MARS implementing either.
 *
 * These check the direction that a hand-written map gets wrong: promising a directive the assembler
 * will refuse. Each documented directive is assembled on its own and the Core must not report that
 * it does not recognise it. Everything else a bare directive provokes, such as a missing operand, is
 * beside the point here and ignored.
 */
function unrecognized(assemble: (source: string) => string[], name: string): boolean {
    const messages = assemble(`\t.text\nmain:\n\t.${name}\n`)
    return messages.some((message) => message.includes(`does not recognize the .${name}`))
}

const mipsMessages = (source: string) => {
    const core = MIPS.makeMipsFromFiles({ 'main.asm': source }, 'main.asm')
    return core.assemble().errors.map((error) => error.message)
}

const riscvMessages = (source: string) => {
    RISCV.setIs64Bit(false)
    const core = RISCV.makeRiscVFromFiles({ 'main.asm': source }, 'main.asm')
    return core.assemble().errors.map((error) => error.message)
}

describe('documented directives exist in the Core', () => {
    it.each(Object.keys(mipsDirectivesMap))('MIPS .%s', (name) => {
        expect(unrecognized(mipsMessages, name)).toBe(false)
    })

    it.each(Object.keys(riscvDirectivesMap))('RISC-V .%s', (name) => {
        expect(unrecognized(riscvMessages, name)).toBe(false)
    })
})
