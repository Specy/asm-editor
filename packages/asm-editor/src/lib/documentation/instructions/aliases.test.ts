import { describe, expect, it } from 'vite-plus/test'
import {
    hasX86InstructionPage,
    x86InstructionAliases
} from '#lib/languages/X86/X86-documentation.ts'
import { riscvInstructionMap } from '#lib/languages/RISC-V/RISC-V-documentation.ts'
import { aliasesOf, aliasTarget } from './aliases'

describe('instruction aliases', () => {
    it('maps every other x86 condition-code spelling to the mnemonic of the code itself', () => {
        expect(aliasTarget('x86', 'jnbe')).toBe('ja')
        expect(aliasTarget('x86', 'setz')).toBe('sete')
        expect(aliasTarget('x86', 'cmovnc')).toBe('cmovae')
        expect(aliasTarget('x86', 'ja')).toBeUndefined()
        expect(aliasesOf('x86', 'jae')).toEqual(['jnb', 'jnc'])
        expect(x86InstructionAliases.size).toBe(42)
    })

    it('points only from a page to a page, never to another alias', () => {
        for (const [alias, main] of x86InstructionAliases) {
            expect(hasX86InstructionPage(alias), alias).toBe(true)
            expect(hasX86InstructionPage(main), main).toBe(true)
            expect(aliasTarget('x86', main), main).toBeUndefined()
        }
        for (const name of ['fmv.s.x', 'fmv.x.s', 'frsr', 'fssr']) {
            const main = aliasTarget('risc-v', name)!
            expect(riscvInstructionMap.has(name), name).toBe(true)
            expect(riscvInstructionMap.has(main), main).toBe(true)
            expect(aliasTarget('risc-v', main), main).toBeUndefined()
        }
    })
})
