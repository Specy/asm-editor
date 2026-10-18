import { describe, expect, it } from 'vite-plus/test'
import {
    x86DocumentedInstructions,
    x86InstructionMap
} from '#lib/languages/X86/X86-documentation.ts'
import { documentPatterns, patternText } from '../instructions/document'
import { x86InstructionDocument } from './instructionDocument'

function rows(name: string): string[] {
    return documentPatterns(x86InstructionDocument(x86InstructionMap.get(name)!)).map(patternText)
}

describe('x86 instruction documents', () => {
    it('writes add as four Form patterns, its sizes as chips', () => {
        expect(rows('add')).toEqual([
            'add r/m, reg',
            'add reg, r/m',
            'add r/m, imm',
            'add acc, imm'
        ])
        const document = x86InstructionDocument(x86InstructionMap.get('add')!)
        const [first] = documentPatterns(document)
        expect(first.chips.map((chip) => chip.label)).toEqual(['8', '16', '32', '64'])
        expect(document.omitted.map((omitted) => omitted.count)).toEqual([19])
    })

    it('writes cmovle as one row, and its processor once in the header', () => {
        const document = x86InstructionDocument(x86InstructionMap.get('cmovle')!)
        expect(documentPatterns(document).map(patternText)).toEqual(['cmovle reg, r/m'])
        expect(document.headerFacts).toEqual(['Pentium Pro and later'])
    })

    it('leaves mov at fifteen rows, the moffs ones last, the control registers privileged', () => {
        const document = x86InstructionDocument(x86InstructionMap.get('mov')!)
        expect(documentPatterns(document).length).toBeLessThanOrEqual(15)
        const [forms, privileged] = document.sections
        expect(forms.tags).toEqual([])
        const ordinary = forms.groups.flatMap((group) => group.patterns.map(patternText))
        expect(ordinary.slice(0, 2)).toEqual(['mov r/m, reg', 'mov reg, r/m'])
        expect(ordinary.slice(-2)).toEqual(['mov acc, moffs', 'mov moffs, acc'])
        expect(privileged.tags).toEqual(['privileged'])
        expect(privileged.groups.flatMap((group) => group.patterns.map(patternText))).toEqual([
            'mov reg64, creg',
            'mov creg, reg64',
            'mov reg64, dreg',
            'mov dreg, reg64'
        ])
    })

    it('keeps the forms of an instruction long mode dropped, and says so', () => {
        const document = x86InstructionDocument(x86InstructionMap.get('aaa')!)
        expect(documentPatterns(document).length).toBeGreaterThan(0)
        expect(document.headerFacts).toContain('Not available in 64-bit mode')
    })

    it('writes jumps with the keyword a program writes', () => {
        expect(rows('jmp')).toContain('jmp short imm8')
        expect(rows('loop')[0]).toBe('loop imm8')
    })

    it('explains every symbol its rows use, on every page', () => {
        for (const instruction of x86DocumentedInstructions) {
            const document = x86InstructionDocument(instruction)
            const explained = new Set(document.operands.map((operand) => operand.symbol))
            for (const pattern of documentPatterns(document)) {
                for (const part of pattern.parts) {
                    if (part.symbol)
                        expect(explained, `${instruction.name}: ${part.text}`).toContain(part.text)
                }
            }
            expect(document.longName, instruction.name).not.toBe('')
            expect(document.summary, instruction.name).not.toBe('')
        }
    })
})
