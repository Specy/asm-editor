import { describe, expect, it } from 'vitest'
import type { MonacoType } from '$lib/monaco/Monaco'
import {
    assemblyOperandContext,
    createAssemblyFoldingProvider,
    createAssemblyRangeFormattingProvider,
    formatAssemblySource,
    parseAssemblyLine,
    splitAssemblyOperands
} from './assemblyText'
import { MIPS_TEXT_OPTIONS } from '$lib/languages/MIPS/MIPS-language'
import { X86_TEXT_OPTIONS } from '$lib/languages/X86/X86-language'
import { Z80_TEXT_OPTIONS } from '$lib/languages/Z80/Z80-language'

describe('shared tolerant assembly text model', () => {
    it('keeps delimiters in strings and nested address expressions out of operand splitting', () => {
        expect(
            splitAssemblyOperands('a, [base + fn(1, 2)], "x,y"').map((part) => part.text)
        ).toEqual(['a', '[base + fn(1, 2)]', '"x,y"'])
        const parsed = parseAssemblyLine('loop: mov rax, [rbx + 4] ; x,y', X86_TEXT_OPTIONS)
        expect(parsed.label?.text).toBe('loop')
        expect(parsed.operation?.text).toBe('mov')
        expect(parsed.operands.map((operand) => operand.text)).toEqual(['rax', '[rbx + 4]'])
        expect(parsed.comment?.text).toBe('; x,y')
    })

    it('tracks top-level active operands and ignores comments', () => {
        expect(assemblyOperandContext('lw $t0, 4($t1)', MIPS_TEXT_OPTIONS)?.activeOperand).toBe(1)
        expect(assemblyOperandContext('add $t0, $t1, ', MIPS_TEXT_OPTIONS)?.activeOperand).toBe(2)
        expect(assemblyOperandContext('ld a, ', Z80_TEXT_OPTIONS)?.activeOperand).toBe(1)
        expect(assemblyOperandContext('add rax, rbx ;, rcx', X86_TEXT_OPTIONS)).toBeNull()
    })

    it('formats conservatively, preserves CRLF, and is idempotent', () => {
        const source = 'loop:   mov   rax,[rbx + 4] ; keep, text\r\n%define  X  1\r\n'
        const formatted = formatAssemblySource(source, X86_TEXT_OPTIONS)
        expect(formatted).toBe('loop: mov rax, [rbx + 4]  ; keep, text\r\n%define X  1\r\n')
        expect(formatAssemblySource(formatted, X86_TEXT_OPTIONS)).toBe(formatted)
    })

    it('expands range formatting to complete selected lines', async () => {
        class Range {
            constructor(
                readonly startLineNumber: number,
                readonly startColumn: number,
                readonly endLineNumber: number,
                readonly endColumn: number
            ) {}
        }
        const provider = createAssemblyRangeFormattingProvider(
            { Range } as unknown as MonacoType,
            X86_TEXT_OPTIONS
        )
        const edits = await provider.provideDocumentRangeFormattingEdits(
            {
                getLineMaxColumn: () => 13,
                getValueInRange: () => 'xor rax,rbx'
            } as never,
            { startLineNumber: 2, startColumn: 5, endLineNumber: 2, endColumn: 8 } as never,
            {} as never,
            {} as never
        )
        expect(edits).toEqual([
            expect.objectContaining({
                range: expect.objectContaining({ startColumn: 1, endColumn: 13 }),
                text: '    xor rax, rbx'
            })
        ])
    })

    it('folds sections, labels, macros, and explicit regions', async () => {
        const monaco = {
            languages: { FoldingRangeKind: { Region: 'region' } }
        } as unknown as MonacoType
        const lines = [
            '.text',
            'main:',
            '    add $t0, $t1, $t2',
            'next:',
            '    nop',
            '.macro twice reg',
            '    add reg, reg, reg',
            '.end_macro',
            '.data',
            'value: .word 1'
        ]
        const ranges = await createAssemblyFoldingProvider(
            monaco,
            MIPS_TEXT_OPTIONS
        ).provideFoldingRanges(
            {
                getLineCount: () => lines.length,
                getLineContent: (line: number) => lines[line - 1] ?? ''
            } as never,
            {} as never,
            {} as never
        )
        expect(ranges).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ start: 2, end: 3 }),
                expect.objectContaining({ start: 6, end: 8 })
            ])
        )
    })
})
