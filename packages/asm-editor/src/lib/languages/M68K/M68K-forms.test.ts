import { describe, expect, it } from 'vite-plus/test'
import { S68k } from '@specy/s68k'
import {
    instructionsDocumentationList,
    M68kDocumentation,
    M68kInstructions,
    M68KRefusedInstructions,
    M68KUncompoundedInstructions,
    M68KUnimplementedDialectInstructions
} from './M68K-documentation'
import { m68kFirstProcessor, m68kInstructionForms } from './M68K-forms'
import { m68kFormTags } from '#lib/documentation/instructions/formTags.ts'

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

    it('tags the forms a later processor brought with it: move from ccr, and extb', () => {
        const later = [...table].flatMap(([mnemonic, forms]) =>
            forms
                .filter((form) => form.processor !== '68000')
                .map((form) => `${mnemonic} ${form.operands.map((modes) => modes[0]).join(',')}`)
        )
        expect(later.sort()).toEqual(['extb Dn', 'move ccr,Dn'])
        const moveFromCcr = table.get('move')!.find((form) => form.operands[0][0] === 'ccr')!
        expect(m68kFormTags(moveFromCcr)).toEqual(['68010'])
        expect(table.get('extb')!.map(m68kFormTags)).toEqual([['68020']])
        expect(m68kFirstProcessor({ name: 'move' })).toBe('68000')
        expect(m68kFirstProcessor({ name: 'extb' })).toBe('68020')
        expect(m68kFirstProcessor({ name: 'dc' })).toBe('68000')
    })

    it('marks as privileged what the 68000 runs only in supervisor mode', () => {
        const privileged = [...table].flatMap(([mnemonic, forms]) =>
            forms
                .filter((form) => form.privileged)
                .map((form) => [mnemonic, ...form.operands.map((modes) => modes[0])].join(' '))
        )
        expect(privileged.sort()).toEqual([
            'andi Im sr',
            'eori Im sr',
            'move An usp',
            'move Dn sr',
            'move usp An',
            'ori Im sr',
            'rte'
        ])
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

    //`stop` and `reset` are 68000 instructions the Core does not run until its interrupts, so they
    //are not in its table and the editor refuses them; once the Core lists one, it needs its
    //documentation entry and its place among the instructions instead, as `rte` had
    it('refuses stop and reset, which are not in the Core’s table yet', () => {
        expect(M68KRefusedInstructions).toEqual(['stop', 'reset'])
        expect(M68KRefusedInstructions.filter((mnemonic) => table.has(mnemonic))).toEqual([])
    })

    //the 68010's and 68020's instructions the Core reads but refuses in every dialect: none may be
    //in its table, where it would need a Documentation entry and to leave this list (milestones E6b
    //and E6c), and each must still be one the Core reads as an instruction and refuses
    it.each(M68KUnimplementedDialectInstructions)(
        'colours %s as refused while the Core reads it and refuses it',
        (mnemonic) => {
            expect(table.has(mnemonic)).toBe(false)
            const result = S68k.assemble(`    opt p=68020\n    ${mnemonic}\n`)
            result.program?.dispose()
            expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContainEqual(
                expect.stringMatching(/^unimplemented_(?:in_dialect|operation)$/)
            )
        }
    )

    it('writes the program for the 68020 in extb’s example, which builds', () => {
        const example = M68kDocumentation.extb.example!
        expect(example).toMatch(/^\s*opt p=68020\n/)
        const result = S68k.assemble(example)
        try {
            expect(result.diagnostics).toEqual([])
            expect(result.program?.getProcessor()).toBe('68020')
        } finally {
            result.program?.dispose()
        }
    })
})
