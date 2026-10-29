import { describe, expect, it } from 'vite-plus/test'
import { S68k } from '@specy/s68k'
import {
    instructionsDocumentationList,
    M68kDocumentation,
    M68kInstructions,
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

    it('tags the forms a later processor brought with it: the 68010’s, and extb', () => {
        const later = [...table].flatMap(([mnemonic, forms]) =>
            forms
                .filter((form) => form.processor !== '68000')
                .map((form) => `${mnemonic} ${form.operands.map((modes) => modes[0]).join(',')}`)
        )
        expect(later.sort()).toEqual([
            'bkpt Im',
            'extb Dn',
            'move ccr,Dn',
            'movec Dn,usp',
            'movec usp,Dn',
            'moves (An),Dn',
            'moves Dn,(An)',
            'rtd Im'
        ])
        const moveFromCcr = table.get('move')!.find((form) => form.operands[0][0] === 'ccr')!
        expect(m68kFormTags(moveFromCcr)).toEqual(['68010'])
        expect(table.get('extb')!.map(m68kFormTags)).toEqual([['68020']])
        //privileged on the 68010, its first processor, as well as of it
        expect(table.get('movec')!.map(m68kFormTags)).toEqual([
            ['privileged', '68010'],
            ['privileged', '68010']
        ])
        expect(table.get('rtd')!.map(m68kFormTags)).toEqual([['68010']])
        expect(m68kFirstProcessor({ name: 'move' })).toBe('68000')
        expect(m68kFirstProcessor({ name: 'extb' })).toBe('68020')
        for (const name of ['rtd', 'bkpt', 'movec', 'moves'])
            expect(m68kFirstProcessor({ name }), name).toBe('68010')
        expect(m68kFirstProcessor({ name: 'dc' })).toBe('68000')
    })

    //`move sr,<ea>` is the 68000's in either mode, and the 68010 made it privileged: the table says
    //so with `privilegedFrom`, which the page writes on its row
    it('reads privilegedFrom: move from sr is privileged from the 68010 on', () => {
        const later = [...table].flatMap(([mnemonic, forms]) =>
            forms
                .filter((form) => !form.privileged && form.privilegedFrom !== undefined)
                .map(
                    (form) =>
                        `${mnemonic} ${form.operands.map((modes) => modes[0]).join(',')} from ${form.privilegedFrom}`
                )
        )
        expect(later).toEqual(['move sr,Dn from 68010'])
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
            'movec Dn usp',
            'movec usp Dn',
            'moves (An) Dn',
            'moves Dn (An)',
            'ori Im sr',
            'reset',
            'rte',
            'stop Im'
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

    //the Core runs `stop` and `reset` since its interrupts, so they are instructions like `rte`
    it('documents stop and reset, which the Core assembles since its interrupts', () => {
        expect(table.has('stop')).toBe(true)
        expect(table.has('reset')).toBe(true)
        expect(M68kInstructions).toEqual(expect.arrayContaining(['stop', 'reset']))
    })

    //the 68020's instructions the Core reads but refuses in every dialect: none may be in its table,
    //where it would need a Documentation entry and to leave this list (milestone E6c; the 68010's
    //left it with E6b), and each must still be one the Core reads as an instruction and refuses
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

    it('leaves no 68010 instruction among the refused ones, which the Core assembles now', () => {
        for (const mnemonic of ['rtd', 'bkpt', 'movec', 'moves']) {
            expect(M68KUnimplementedDialectInstructions).not.toContain(mnemonic)
            expect(table.has(mnemonic), mnemonic).toBe(true)
        }
    })

    //an instruction a later processor brought writes the program for that processor first, in its
    //short example and in the one the page opens in an editor
    it.each([
        ['extb', '68020'],
        ['rtd', '68010'],
        ['bkpt', '68010'],
        ['movec', '68010'],
        ['moves', '68010']
    ] as const)(
        'writes the program for the processor in %s’s examples, which build',
        (name, processor) => {
            const entry = M68kDocumentation[name]
            const examples = [entry.example!, entry.interactiveExample?.code].filter(
                (example): example is string => example !== undefined
            )
            for (const example of examples) {
                expect(example).toMatch(new RegExp(`^\\s*opt p=${processor}\\n`))
                const result = S68k.assemble(example)
                try {
                    expect(result.diagnostics).toEqual([])
                    expect(result.program?.getProcessor()).toBe(processor)
                } finally {
                    result.program?.dispose()
                }
            }
        }
    )
})
