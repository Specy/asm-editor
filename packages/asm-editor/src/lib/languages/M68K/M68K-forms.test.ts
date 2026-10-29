import { describe, expect, it } from 'vite-plus/test'
import { S68k } from '@specy/s68k'
import {
    instructionsDocumentationList,
    M68kDocumentation,
    M68kInstructions,
    M68KRefusedInstructions,
    M68KUncompoundedInstructions
} from './M68K-documentation'
import { m68kFirstProcessor, m68kInstructionForms, m68kIsBitField } from './M68K-forms'
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

    it('tags the forms a later processor brought with it: the 68010’s, and the 68020’s', () => {
        const later = (processor: string) =>
            [...table].flatMap(([mnemonic, forms]) =>
                forms
                    .filter((form) => form.processor === processor)
                    .map(
                        (form) => `${mnemonic} ${form.operands.map((modes) => modes[0]).join(',')}`
                    )
            )
        expect(later('68010').sort()).toEqual([
            'bkpt Im',
            'move ccr,Dn',
            'movec Dn,usp',
            'movec usp,Dn',
            'moves (An),Dn',
            'moves Dn,(An)',
            'rtd Im'
        ])
        //the 68020's own shapes of the 68000's instructions, beside its own instructions
        expect(
            later('68020')
                .filter((form) => !/^(?:bf|trap|cas|chk2|cmp2|pack|unpk|div[su]l)/.test(form))
                .sort()
        ).toEqual([
            'chk Dn,Dn',
            'cmp Im,d(PC)',
            'cmpi Im,d(PC)',
            'divs Dn,Dn',
            'divu Dn,Dn',
            'extb Dn',
            //`link.w`, the 68000's `link` with its size written, and `link.l`
            'link An,Im',
            'link An,Im',
            'muls Dn,Dn',
            'mulu Dn,Dn',
            'tst Dn'
        ])
        //every form of the 68020's own instructions is the 68020's
        const own = ['chk2', 'cmp2', 'cas', 'cas2', 'pack', 'unpk', 'divsl', 'divul', 'trapeq']
        for (const name of [...own, 'bfextu'])
            expect(new Set(table.get(name)!.map((form) => form.processor)), name).toEqual(
                new Set(['68020'])
            )
        const moveFromCcr = table.get('move')!.find((form) => form.operands[0][0] === 'ccr')!
        expect(m68kFormTags(moveFromCcr)).toEqual(['68010'])
        expect(table.get('extb')!.map(m68kFormTags)).toEqual([['68020']])
        //privileged on the 68010, its first processor, as well as of it
        expect(table.get('movec')!.map(m68kFormTags)).toEqual([
            ['privileged', '68010'],
            ['privileged', '68010']
        ])
        expect(table.get('rtd')!.map(m68kFormTags)).toEqual([['68010']])
        //a bit field is the 68020's, and EASy68K's `opt bit` gives it to the 68000 and the 68010
        expect(table.get('bfextu')!.map(m68kFormTags)).toEqual([['68020', 'opt-bit']])
        expect(table.get('cas2')!.map(m68kFormTags)).toEqual([['68020']])
        expect(table.get('muls')!.map(m68kFormTags)).toEqual([[], ['68020']])
        expect(table.get('link')!.map((form) => [form.sizes, m68kFormTags(form)])).toEqual([
            [[], []],
            [['word'], ['68020']],
            [['long'], ['68020']]
        ])
        expect(m68kFirstProcessor({ name: 'move' })).toBe('68000')
        expect(m68kFirstProcessor({ name: 'extb' })).toBe('68020')
        expect(m68kFirstProcessor(M68kDocumentation.trapcc)).toBe('68020')
        const bitFields = instructionsDocumentationList.filter(m68kIsBitField).map((i) => i.name)
        expect(bitFields.sort()).toEqual(
            ['bfchg', 'bfclr', 'bfexts', 'bfextu', 'bfffo', 'bfins', 'bfset', 'bftst'].sort()
        )
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

    //the 68020's module call is the one instruction of the three processors the Core reads and
    //refuses for good: it is in no table and has no Documentation entry, and the editor colours it
    //as refused (milestone E6c; nothing is still to come)
    it.each(M68KRefusedInstructions)(
        'colours %s as refused while the Core reads it and refuses it',
        (mnemonic) => {
            expect(table.has(mnemonic)).toBe(false)
            expect(M68kInstructions).not.toContain(mnemonic)
            const result = S68k.assemble(`    opt p=68020\n    ${mnemonic}\n`)
            result.program?.dispose()
            expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContainEqual(
                'unimplemented_operation'
            )
        }
    )

    it('refuses nothing else: every 68010 and 68020 instruction is in the Core’s table', () => {
        expect(M68KRefusedInstructions).toEqual(['callm', 'rtm'])
        const later = [
            ...['rtd', 'bkpt', 'movec', 'moves', 'chk2', 'cmp2', 'cas', 'cas2', 'pack', 'unpk'],
            ...['divsl', 'divul', 'trapt', 'trapf', 'traphs', 'traplo'],
            ...['bftst', 'bfextu', 'bfexts', 'bfffo', 'bfchg', 'bfclr', 'bfset', 'bfins']
        ]
        for (const mnemonic of later) {
            expect(table.has(mnemonic), mnemonic).toBe(true)
            expect(M68kInstructions, mnemonic).toContain(mnemonic)
        }
    })

    //an instruction a later processor brought writes the program for that processor first, in its
    //short example and in the one the page opens in an editor
    it.each([
        ['extb', '68020'],
        ['rtd', '68010'],
        ['bkpt', '68010'],
        ['movec', '68010'],
        ['moves', '68010'],
        ...(
            [
                ...['trapcc', 'chk2', 'cmp2', 'cas', 'cas2', 'pack', 'unpk', 'divsl', 'divul'],
                ...['bftst', 'bfextu', 'bfexts', 'bfffo', 'bfchg', 'bfclr', 'bfset', 'bfins']
            ] as const
        ).map((name) => [name, '68020'] as const)
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
