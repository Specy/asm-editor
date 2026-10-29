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

    it('is undefined for a name with no page', () => {
        expect(m68kInstructionDocument('callm')).toBeUndefined()
        expect(m68kInstructionDocument('dc')).toBeUndefined()
    })

    it('explains every symbol its rows use, on every page, with links that resolve', () => {
        const modesChapter = chapters().find((chapter) => chapter.id === 'addressing-modes')!
        const hrefs = new Set([
            modesChapter.href,
            ...modesChapter.entries.map((entry) => entry.href)
        ])
        expect(PAGE_NAMES.length).toBe(129)
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
