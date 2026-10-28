import { describe, expect, it } from 'vite-plus/test'
import { S68k } from '@specy/s68k'
import {
    instructionsDocumentationList,
    M68kInstructions,
    M68KRefusedInstructions,
    M68KUncompoundedInstructions
} from './M68K-documentation'
import { m68kInstructionForms } from './M68K-forms'

const table = new Map(S68k.instructionTable().map(({ mnemonic, forms }) => [mnemonic, forms]))

describe('M68K instruction forms', () => {
    it("gives a family its members' forms, which every member shares", () => {
        for (const instruction of instructionsDocumentationList) {
            if (!instruction.compundNames) continue
            const forms = m68kInstructionForms(instruction)
            for (const member of instruction.compundNames) {
                expect(table.get(member), `${instruction.name}: ${member}`).toEqual(forms)
            }
        }
    })

    it('finds forms for every documented instruction, by its own name when it is no family', () => {
        for (const instruction of instructionsDocumentationList) {
            const forms = m68kInstructionForms(instruction)
            expect(forms.length, instruction.name).toBeGreaterThan(0)
            if (!instruction.compundNames) expect(forms).toEqual(table.get(instruction.name))
        }
    })

    it('marks only move, andi, ori and eori to sr as privileged', () => {
        const privileged = [...table].flatMap(([mnemonic, forms]) =>
            forms.filter((form) => form.privileged).map((form) => `${mnemonic} ${form.operands[1]}`)
        )
        expect(privileged.sort()).toEqual(['andi sr', 'eori sr', 'move sr', 'ori sr'])
    })
})

describe('M68K documentation of the Core’s instructions', () => {
    it('documents every mnemonic the Core assembles, a family member under its family', () => {
        const documented = new Set(M68KUncompoundedInstructions.keys())
        expect([...table.keys()].filter((mnemonic) => !documented.has(mnemonic))).toEqual([])
    })

    it('documents nothing as an instruction that the Core does not assemble', () => {
        expect(M68kInstructions.filter((mnemonic) => !table.has(mnemonic))).toEqual([])
    })

    //`rte`, `stop` and `reset` are 68000 instructions the Core does not run yet, so they are not in
    //its table and the editor refuses them; once the Core lists one, it needs its documentation
    //entry and its place among the instructions instead (the plan's milestone E7b)
    it('refuses rte, stop and reset, which are not in the Core’s table yet', () => {
        expect(M68KRefusedInstructions).toEqual(['rte', 'stop', 'reset'])
        expect(M68KRefusedInstructions.filter((mnemonic) => table.has(mnemonic))).toEqual([])
    })
})
