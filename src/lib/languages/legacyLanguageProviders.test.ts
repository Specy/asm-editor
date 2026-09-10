import { describe, expect, it } from 'vitest'
import type { MonacoType } from '$lib/monaco/Monaco'
import {
    createMIPSCompletion,
    createMIPSSignatureHelpProvider
} from './MIPS/MIPS-language'
import {
    createRISCVCompletion,
    createRISCVSignatureHelpProvider
} from './RISC-V/RISC-V-language'
import { createZ80SignatureHelpProvider } from './Z80/Z80-language'
import {
    createX86CompletionProvider,
    createX86SignatureHelpProvider
} from './X86/X86-language'

class Range {
    constructor(
        readonly startLineNumber: number,
        readonly startColumn: number,
        readonly endLineNumber: number,
        readonly endColumn: number
    ) {}
}

const monacoStub = {
    Range,
    languages: {
        CompletionItemKind: {
            Constant: 1,
            Function: 2,
            Keyword: 3,
            Variable: 4,
            Snippet: 5,
            Reference: 6,
            TypeParameter: 7,
            Value: 8,
            Module: 9
        },
        CompletionItemInsertTextRule: { InsertAsSnippet: 4 }
    }
} as unknown as MonacoType

function modelFor(line: string) {
    return {
        getValue: () => line,
        getValueInRange: () => line,
        getLineContent: () => line,
        getWordUntilPosition: (position: { column: number }) => {
            const prefix = line.slice(0, position.column - 1)
            const word = /[A-Za-z0-9_]+$/.exec(prefix)?.[0] ?? ''
            return {
                word,
                startColumn: position.column - word.length,
                endColumn: position.column
            }
        }
    }
}

async function completionLabels(
    provider: ReturnType<typeof createMIPSCompletion> | ReturnType<typeof createRISCVCompletion>,
    line: string
) {
    const position = { lineNumber: 1, column: line.length + 1 }
    const result = await provider.provideCompletionItems(
        modelFor(line) as never,
        position as never,
        {} as never,
        {} as never
    )
    return result?.suggestions ?? []
}

describe('MIPS and RISC-V completion contracts', () => {
    it('does not throw on a label-only line', async () => {
        await expect(completionLabels(createMIPSCompletion(monacoStub), 'loop:')).resolves.toEqual(
            expect.any(Array)
        )
        await expect(completionLabels(createRISCVCompletion(monacoStub), 'loop:')).resolves.toEqual(
            expect.any(Array)
        )
    })

    it('does not count an attached label as the first instruction operand', async () => {
        const mips = await completionLabels(createMIPSCompletion(monacoStub), 'loop:lui ')
        expect(mips.map((item) => item.label)).toContain('$reg')

        const riscv = await completionLabels(createRISCVCompletion(monacoStub), 'loop:lui ')
        expect(riscv.map((item) => item.label)).toContain('reg')
    })

    it('inserts complete RISC-V register names', async () => {
        const provider = createRISCVCompletion(monacoStub)
        expect(await completionLabels(provider, 'add t')).toContainEqual(
            expect.objectContaining({ label: 't0', insertText: 't0' })
        )
        expect(await completionLabels(provider, 'add z')).toContainEqual(
            expect.objectContaining({ label: 'zero', insertText: 'zero' })
        )
        expect(await completionLabels(provider, 'add x1')).toContainEqual(
            expect.objectContaining({ label: 'x10', insertText: 'x10' })
        )
    })

    it('keeps execution-only MIPS registers out of operand completion', async () => {
        const suggestions = await completionLabels(createMIPSCompletion(monacoStub), 'add $')
        expect(suggestions.map((item) => item.label)).not.toEqual(
            expect.arrayContaining(['pc', 'hi', 'lo'])
        )
        expect(suggestions.map((item) => item.label)).toContain('$f0')
    })

    it('supports uppercase mnemonics and keeps RV64-only forms out of RV32', async () => {
        const uppercaseMips = await completionLabels(createMIPSCompletion(monacoStub), 'AD')
        expect(uppercaseMips).toContainEqual(
            expect.objectContaining({ label: 'add', insertText: 'ADD' })
        )
        const uppercase = await completionLabels(createRISCVCompletion(monacoStub), 'AD')
        expect(uppercase).toContainEqual(
            expect.objectContaining({ label: 'add', insertText: 'ADD' })
        )

        const rv32 = await completionLabels(createRISCVCompletion(monacoStub), 'addi')
        const rv64 = await completionLabels(createRISCVCompletion(monacoStub, true), 'addi')
        expect(rv32.map((item) => item.label)).not.toContain('addiw')
        expect(rv64.map((item) => item.label)).toContain('addiw')
    })

    it('offers instruction snippets and suppresses completions in comments', async () => {
        const mips = await completionLabels(createMIPSCompletion(monacoStub), 'ad')
        expect(mips).toContainEqual(
            expect.objectContaining({ insertText: expect.stringContaining('${1:') })
        )
        expect(await completionLabels(createMIPSCompletion(monacoStub), 'add $t0 # ad')).toEqual([])
        expect(await completionLabels(createRISCVCompletion(monacoStub), 'add t0 # ad')).toEqual([])
    })
})

async function signature(
    provider: {
        provideSignatureHelp: (...args: never[]) => unknown
    },
    line: string
) {
    return provider.provideSignatureHelp(
        modelFor(line) as never,
        { lineNumber: 1, column: line.length + 1 } as never,
        {} as never,
        {} as never
    ) as Promise<
        | {
              value: {
                  activeParameter: number
                  signatures: { label: string }[]
              }
          }
        | null
    >
}

describe('assembly signature help', () => {
    it('tracks logical MIPS/RISC-V operands rather than commas inside addressing expressions', async () => {
        const mips = await signature(createMIPSSignatureHelpProvider(monacoStub), 'lw $t0, 4($t1)')
        expect(mips?.value.activeParameter).toBe(1)
        expect(mips?.value.signatures[0]?.label).toContain('lw ')

        const riscv = await signature(
            createRISCVSignatureHelpProvider(monacoStub),
            'sw t0, 4(t1)'
        )
        expect(riscv?.value.activeParameter).toBe(1)
        expect(
            await signature(createRISCVSignatureHelpProvider(monacoStub), 'addiw t0, t1, 1')
        ).toBeNull()
        expect(
            await signature(createRISCVSignatureHelpProvider(monacoStub, true), 'addiw t0, t1, 1')
        ).not.toBeNull()
    })

    it('provides Z80 and NASM forms at the active operand', async () => {
        const z80 = await signature(createZ80SignatureHelpProvider(monacoStub), 'ld a, ')
        expect(z80?.value.activeParameter).toBe(1)
        expect(z80?.value.signatures.some((item) => item.label.startsWith('ld '))).toBe(true)

        const x86 = await signature(createX86SignatureHelpProvider(monacoStub), 'mov rax, ')
        expect(x86?.value.activeParameter).toBe(1)
        expect(x86?.value.signatures[0]?.label).toBe('mov destination, source')
    })

    it('keeps x86 operand completion contextual', async () => {
        const provider = createX86CompletionProvider(monacoStub)
        const registerItems = await completionLabels(provider as never, 'mov r')
        expect(registerItems.map((item) => item.label)).toContain('rax')
        expect(registerItems.map((item) => item.label)).not.toContain('ret')
    })
})
