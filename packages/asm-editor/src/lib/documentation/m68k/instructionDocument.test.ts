import { describe, expect, it } from 'vite-plus/test'
import { M68KUncompoundedInstructions } from '#lib/languages/M68K/M68K-documentation.ts'
import { documentPatterns, patternText, type InstructionDocument } from '../instructions/document'
import { m68kInstructionDocument } from './instructionDocument'
import { chapters } from './m68k'
import { m68kModeClass } from './operands'

function document(name: string): InstructionDocument {
    const built = m68kInstructionDocument(name)
    if (!built) throw new Error(`no document for ${name}`)
    return built
}

function rows(name: string): string[] {
    return documentPatterns(document(name)).map(patternText)
}

const PAGE_NAMES = [...M68KUncompoundedInstructions.keys()]

describe('M68K instruction documents', () => {
    it('writes move as its seven forms, those into sr and with usp privileged, the one from ccr the 68010’s', () => {
        const move = document('move')
        const [forms, privileged, for68010] = move.sections
        expect(forms.tags).toEqual([])
        expect(forms.groups.flatMap((group) => group.patterns.map(patternText))).toEqual([
            'move <ea>, <ea>',
            'move <ea>, ccr',
            'move sr, <ea>'
        ])
        expect(privileged.tags).toEqual(['privileged'])
        expect(privileged.explanation).toContain('privilege violation')
        expect(privileged.groups.flatMap((group) => group.patterns.map(patternText))).toEqual([
            'move <ea>, sr',
            'move usp, An',
            'move An, usp'
        ])
        expect(for68010.tags).toEqual(['68010'])
        expect(for68010.explanation).toBe(
            'The 68010 and the 68020 have these, the 68000 does not: write `opt p=68010` at the top of the program to use them.'
        )
        expect(for68010.groups.flatMap((group) => group.patterns.map(patternText))).toEqual([
            'move ccr, <ea>'
        ])
        expect(move.sections).toHaveLength(3)
        expect(move.tags).toEqual([])
        expect(move.headerFacts).toEqual([])

        const [general] = documentPatterns(move)
        expect(general.details).toEqual([
            {
                label: 'Source',
                name: 'all modes',
                values: [
                    'Dn',
                    'An',
                    '(An)',
                    '(An)+',
                    '-(An)',
                    'd(An)',
                    'd(An,Xn)',
                    'abs',
                    'd(PC)',
                    'd(PC,Xn)',
                    '#imm'
                ]
            },
            {
                label: 'Destination',
                name: 'alterable',
                values: ['Dn', 'An', '(An)', '(An)+', '-(An)', 'd(An)', 'd(An,Xn)', 'abs']
            }
        ])
        // the rows' sizes differ, so each row says its own and the header none
        expect(move.headerFacts).toEqual([])
        expect(general.facts).toEqual(['Sizes .b .w .l, .w by default'])
        expect(documentPatterns(move)[1].facts).toEqual(['Size .w'])
    })

    it('says the sizes once in the header when every row shares them', () => {
        const add = document('add')
        expect(rows('add')).toEqual(['add <ea>, <ea>'])
        expect(add.headerFacts).toEqual(['Sizes .b .w .l, .w by default'])
        expect(documentPatterns(add)[0].facts).toEqual([])
        expect(document('bra').headerFacts).toEqual(['Sizes .b .s .w .l'])
        expect(document('moveq').headerFacts).toEqual(['Size .l'])
    })

    it('names the control modes lea takes', () => {
        expect(rows('lea')).toEqual(['lea <ea>, An'])
        expect(documentPatterns(document('lea'))[0].details).toEqual([
            {
                label: 'Source',
                name: 'control',
                values: ['(An)', 'd(An)', 'd(An,Xn)', 'abs', 'd(PC)', 'd(PC,Xn)']
            }
        ])
    })

    it('says extb is the 68020’s alone, and how to write a program for it', () => {
        const extb = document('extb')
        expect(extb.tags).toEqual(['68020'])
        expect(extb.headerFacts).toEqual([
            'Size .l',
            '68020 only: write `opt p=68020` at the top of the program'
        ])
        //the tag is the mnemonic's, so its one form is in the untagged section
        expect(extb.sections.map((section) => section.tags)).toEqual([[]])
        expect(rows('extb')).toEqual(['extb Dn'])
    })

    it('writes the 68010’s movec and moves in the manual’s Rc and Rn, privileged and the 68010’s', () => {
        const movec = document('movec')
        expect(movec.tags).toEqual(['privileged', '68010'])
        expect(movec.headerFacts).toEqual([
            'Size .l',
            '68010 and 68020 only: write `opt p=68010` at the top of the program'
        ])
        expect(movec.category).toBe('system')
        expect(rows('movec')).toEqual(['movec Rc, Rn', 'movec Rn, Rc'])
        expect(documentPatterns(movec)[0].details).toEqual([
            { label: 'Source', values: ['usp', 'Rc'], name: undefined },
            { label: 'Destination', values: ['Dn', 'An'], name: undefined }
        ])
        expect(movec.operands.map((operand) => [operand.symbol, operand.href])).toEqual([
            ['Rc', '/documentation/m68k/addressing-mode#control-registers'],
            ['Rn', '/documentation/m68k/addressing-mode#direct']
        ])
        expect(rows('moves')).toEqual(['moves Rn, <ea>', 'moves <ea>, Rn'])
        expect(document('moves').tags).toEqual(['privileged', '68010'])
        expect(rows('rtd')).toEqual(['rtd #imm'])
        expect(document('rtd').tags).toEqual(['68010'])
        expect(document('rtd').category).toBe('control-flow')
        expect(document('bkpt').operands[0].meaning).toContain('`0` to `7`')
    })

    it('says on move’s row from sr that the 68010 made it privileged, from privilegedFrom', () => {
        const fromSr = documentPatterns(document('move')).find(
            (pattern) => patternText(pattern) === 'move sr, <ea>'
        )!
        expect(fromSr.facts).toEqual(['Size .w', 'Privileged on the 68010 and 68020'])
        //it stays in the untagged section: the 68000 runs it in user mode
        expect(
            document('move')
                .sections[0].groups.flatMap((group) => group.patterns)
                .map(patternText)
        ).toContain('move sr, <ea>')
        expect(document('move').description).toContain('move ccr, d0')
    })

    it('puts andi into sr under Privileged, and each row its own size', () => {
        const andi = document('andi')
        expect(andi.sections.map((section) => section.tags)).toEqual([[], ['privileged']])
        expect(rows('andi')).toEqual(['andi #imm, <ea>', 'andi #imm, ccr', 'andi #imm, sr'])
        expect(documentPatterns(andi).map((pattern) => pattern.facts)).toEqual([
            ['Sizes .b .w .l, .w by default'],
            ['Size .b'],
            ['Size .w']
        ])
        expect(andi.headerFacts).toEqual([])
        expect(documentPatterns(andi)[0].details[0]).toMatchObject({
            label: 'Destination',
            name: 'data alterable'
        })
    })

    it('says rte is privileged in its one form, a system instruction that restores every flag', () => {
        const rte = document('rte')
        expect(rte.longName).toBe('Return from exception')
        expect(rte.category).toBe('system')
        //every form is privileged, so the tag is the mnemonic's, and its row is in the untagged section
        expect(rte.tags).toEqual(['privileged'])
        expect(rte.sections.map((section) => section.tags)).toEqual([[]])
        expect(rows('rte')).toEqual(['rte'])
        expect(Object.values(rte.flags?.marks ?? {}).map((mark) => mark.kind)).toEqual([
            'changed',
            'changed',
            'changed',
            'changed',
            'changed'
        ])
    })

    it('explains usp in move’s legend, linked to its addressing mode', () => {
        expect(document('move').operands.find((operand) => operand.symbol === 'usp')).toEqual({
            symbol: 'usp',
            meaning:
                'The user stack pointer: the `a7` a program has in user mode. Supervisor code reads and sets it through an address register, as in `move.l usp, a0`.',
            href: '/documentation/m68k/addressing-mode#user-stack-pointer'
        })
    })

    //the 68020's indexed modes go wherever `d(An,Xn)` and `d(PC,Xn)` do, and no row lists them
    it('says in the legend of an <ea> that takes an indexed mode that the 68020 has more', () => {
        const meaning = (name: string) =>
            document(name).operands.find((operand) => operand.symbol === '<ea>')?.meaning
        for (const name of ['move', 'lea', 'jmp', 'add']) {
            expect(meaning(name), name).toContain(
                'In a program for the 68020, wherever `d(An,Xn)` or `d(PC,Xn)` is allowed, so are the 68020’s indexed modes'
            )
            expect(meaning(name), name).toContain('(/documentation/m68k/addressing-mode#68020)')
        }
    })

    it('says how far each size of a branch reaches, the 68020’s long branch included', () => {
        for (const name of ['bra', 'bsr', 'bcc', 'beq']) {
            const built = document(name)
            //the summary stays the first sentence, which the reach does not run into
            expect(built.summary, name).not.toContain('size')
            expect(built.description, name).toContain('`.l` is a long branch')
            expect(built.description, name).toContain(
                '(/documentation/m68k/addressing-mode#long-branches)'
            )
        }
    })

    it('writes movem with a register list', () => {
        expect(rows('movem')).toEqual([
            'movem <register list>, <ea>',
            'movem <ea>, <register list>'
        ])
        const movem = document('movem')
        const [store, load] = documentPatterns(movem)
        expect(store.details[0]).toEqual({
            label: 'Source',
            values: ['Dn', 'An', '<register list>'],
            name: undefined
        })
        // control or postincrement is no class of its own
        expect(load.details[0].name).toBeUndefined()
        expect(movem.operands.map((operand) => operand.symbol)).toContain('<register list>')
    })

    it('keeps the two shift forms apart, each with its sizes', () => {
        const asl = document('asl')
        expect(rows('asl')).toEqual(['asl <ea>, Dn', 'asl <ea>'])
        expect(documentPatterns(asl).map((pattern) => pattern.facts)).toEqual([
            ['Sizes .b .w .l, .w by default'],
            ['Size .w']
        ])
        expect(asl.headerFacts).toEqual([])
        expect(documentPatterns(asl)[1].details).toEqual([
            {
                label: 'Operand',
                name: 'memory alterable',
                values: ['(An)', '(An)+', '-(An)', 'd(An)', 'd(An,Xn)', 'abs']
            }
        ])
        expect(asl.longName).toBe('Arithmetic shift left')
        expect(asl.operands.find((operand) => operand.symbol === '#imm')?.meaning).toContain(
            '`1` to `8`'
        )
    })

    it('gives a family member its own name and the flags its condition reads', () => {
        const beq = document('beq')
        expect(rows('beq')).toEqual(['beq label'])
        expect(beq.longName).toBe('Branch if equal')
        expect(beq.category).toBe('control-flow')
        expect(beq.flags?.reads).toEqual(['Z'])
        expect(document('bge').flags?.reads).toEqual(['N', 'V'])

        const bcc = document('bcc')
        expect(rows('bcc')).toEqual(['bcc label'])
        expect(bcc.longName).toBe('Branch conditionally')
        expect(bcc.summary).not.toContain('{')
        expect(bcc.flags?.reads).toBeUndefined()
        expect(document('asd').summary).not.toContain('{')
        expect(rows('asd')).toEqual(['asd <ea>, Dn', 'asd <ea>'])
    })

    it('writes dbra with its counter and its target', () => {
        expect(rows('dbra')).toEqual(['dbra Dn, label'])
        expect(rows('dbne')).toEqual(['dbne Dn, label'])
        expect(document('dbne').longName).toBe('Decrement and branch until not equal')
    })

    it('writes an instruction without operands as its mnemonic alone', () => {
        for (const name of ['nop', 'rts']) {
            const built = document(name)
            expect(rows(name)).toEqual([name])
            expect(built.operands).toEqual([])
            expect(built.headerFacts).toEqual([])
            expect(documentPatterns(built)[0].details).toEqual([])
        }
    })

    it('draws the flags in the register panel order, from the hand-written marks', () => {
        const flags = document('and').flags
        expect(flags?.order).toEqual(['X', 'N', 'Z', 'V', 'C'])
        expect(flags?.marks).toEqual({
            X: { kind: 'unchanged' },
            N: { kind: 'changed' },
            Z: { kind: 'changed' },
            V: { kind: 'cleared' },
            C: { kind: 'cleared' }
        })
        expect(document('clr').flags?.marks?.Z).toEqual({ kind: 'set' })
        expect(document('addx').flags?.reads).toEqual(['X'])
    })

    it('names a set of modes only when it is exactly one of the 68000 classes', () => {
        expect(m68kModeClass(['Dn', '(An)', '(An)+', '-(An)', 'd(An)', 'd(An,Xn)', 'abs'])).toBe(
            'data alterable'
        )
        expect(
            m68kModeClass([
                '(An)',
                '(An)+',
                '-(An)',
                'd(An)',
                'd(An,Xn)',
                'abs',
                'd(PC)',
                'd(PC,Xn)',
                '#imm'
            ])
        ).toBe('memory')
        expect(m68kModeClass(['Dn', '(An)', '(An)+', '-(An)', 'd(An)', 'd(An,Xn)'])).toBeUndefined()
        expect(m68kModeClass(['Dn', 'An'])).toBeUndefined()
    })

    //the 68020's long multiplies and divides write a register or a pair, one form in s68k's table
    //and two rows in the manual's, each pair in the letters of what it holds
    it('writes the 68020’s pairs in the manual’s letters, a register or a pair as two rows', () => {
        expect(rows('muls')).toEqual(['muls <ea>, Dn', 'muls <ea>, Dn', 'muls <ea>, Dh:Dl'])
        const muls = document('muls')
        expect(muls.sections.map((section) => section.tags)).toEqual([[], ['68020']])
        expect(documentPatterns(muls).map((pattern) => pattern.facts)).toEqual([
            ['Size .w'],
            ['Size .l'],
            ['Size .l']
        ])
        expect(rows('divu')).toEqual(['divu <ea>, Dn', 'divu <ea>, Dn', 'divu <ea>, Dr:Dq'])
        expect(rows('divul')).toEqual(['divul <ea>, Dr:Dq'])
        expect(rows('cas2')).toEqual(['cas2 Dc1:Dc2, Du1:Du2, (Rn1):(Rn2)'])
        const meaning = (name: string, symbol: string) =>
            document(name).operands.find((operand) => operand.symbol === symbol)
        expect(meaning('muls', 'Dh:Dl')).toMatchObject({
            href: '/documentation/m68k/addressing-mode#register-pairs'
        })
        expect(meaning('divs', 'Dr:Dq')?.meaning).toContain('the quotient goes into `Dq`')
        expect(meaning('cas2', '(Rn1):(Rn2)')?.meaning).toContain('`(a0):(a1)`')
    })

    //the 68000's `link` takes no size, and the 68020 writes it `link.w`, the same words, or
    //`link.l`, with a long displacement
    it('writes link without a size, and link.w and link.l as the 68020’s', () => {
        const link = document('link')
        expect(link.sections.map((section) => section.tags)).toEqual([[], ['68020']])
        expect(rows('link')).toEqual(['link An, #imm', 'link An, #imm', 'link An, #imm'])
        expect(documentPatterns(link).map((pattern) => pattern.facts)).toEqual([
            [],
            ['Size .w'],
            ['Size .l']
        ])
        expect(link.description).toContain('`link.w` is the same instruction')
    })

    it('writes a bit field after its operand, the 68020’s or the 68000’s with opt bit', () => {
        const bfextu = document('bfextu')
        expect(bfextu.tags).toEqual(['68020', 'opt-bit'])
        expect(bfextu.headerFacts).toEqual([
            '68020, or 68000 and 68010 with `opt bit`: write `opt p=68020` or `opt bit` at the top of the program'
        ])
        expect(bfextu.sections.map((section) => section.tags)).toEqual([[]])
        expect(rows('bfextu')).toEqual(['bfextu <ea>{offset:width}, Dn'])
        expect(rows('bfins')).toEqual(['bfins Dn, <ea>{offset:width}'])
        //what the field is in: a data register, or memory through a control mode
        const [pattern] = documentPatterns(bfextu)
        expect(pattern.details).toEqual([
            {
                label: 'Source',
                values: ['Dn', '(An)', 'd(An)', 'd(An,Xn)', 'abs', 'd(PC)', 'd(PC,Xn)']
            }
        ])
        expect(documentPatterns(document('bfset'))[0].details[0].values).toEqual([
            'Dn',
            '(An)',
            'd(An)',
            'd(An,Xn)',
            'abs'
        ])
        const field = bfextu.operands.find((operand) => operand.symbol === '{offset:width}')
        expect(field).toMatchObject({ href: '/documentation/m68k/addressing-mode#bit-fields' })
        //the other 68020 instructions are the 68020's alone
        expect(document('cas').headerFacts.at(-1)).toBe(
            '68020 only: write `opt p=68020` at the top of the program'
        )
    })

    it('gives trap<cc> a family page and one for each condition, with and without its operand', () => {
        const family = document('trapcc')
        expect([family.longName, family.summary]).toEqual([
            'Trap on condition',
            'Raises an exception if cc, and does nothing otherwise.'
        ])
        const trapeq = document('trapeq')
        expect([trapeq.longName, trapeq.summary]).toEqual([
            'Trap if equal',
            'Raises an exception if equal, and does nothing otherwise.'
        ])
        expect(rows('trapeq')).toEqual(['trapeq', 'trapeq #imm'])
        expect(trapeq.flags?.reads).toEqual(['Z'])
        expect(trapeq.tags).toEqual(['68020'])
        expect(trapeq.operands.find((operand) => operand.symbol === '#imm')?.meaning).toContain(
            'tell its traps apart'
        )
        expect(document('trapf').summary).toBe(
            'Never traps, because the false condition never holds.'
        )
        expect(document('trapt').flags?.reads).toBeUndefined()
    })

    it('is undefined for a name with no page', () => {
        expect(m68kInstructionDocument('callm')).toBeUndefined()
        expect(m68kInstructionDocument('rtm')).toBeUndefined()
        expect(m68kInstructionDocument('dc')).toBeUndefined()
    })

    it('explains every symbol its rows use, on every page, with links that resolve', () => {
        const modesChapter = chapters().find((chapter) => chapter.id === 'addressing-modes')!
        const hrefs = new Set([
            modesChapter.href,
            ...modesChapter.entries.map((entry) => entry.href)
        ])
        expect(PAGE_NAMES.length).toBe(167)
        for (const name of PAGE_NAMES) {
            const built = document(name)
            const explained = new Set(built.operands.map((operand) => operand.symbol))
            for (const pattern of documentPatterns(built)) {
                expect(pattern.forms.length, name).toBe(1)
                for (const part of pattern.parts) {
                    if (part.symbol) expect(explained, `${name}: ${part.text}`).toContain(part.text)
                }
                for (const detail of pattern.details) {
                    if (detail.values.includes('#imm')) expect(explained, name).toContain('#imm')
                }
            }
            for (const operand of built.operands) {
                if (operand.href)
                    expect(hrefs, `${name}: ${operand.symbol}`).toContain(operand.href)
            }
            expect(built.longName, name).not.toBe('')
            expect(built.summary, name).not.toBe('')
            expect(built.summary, name).not.toMatch(/[{}]/)
            expect(built.category, name).toBeDefined()
            expect(built.omitted).toEqual([])
            expect(documentPatterns(built).length, name).toBeGreaterThan(0)
        }
    })
})
