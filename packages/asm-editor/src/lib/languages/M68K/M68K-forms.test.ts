import { describe, expect, it } from 'vite-plus/test'
import { S68k } from '@specy/s68k'
import { instructionsDocumentationList } from './M68K-documentation'
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
