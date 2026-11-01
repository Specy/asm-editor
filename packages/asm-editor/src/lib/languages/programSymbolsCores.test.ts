import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vite-plus/test'
import { MIPSEmulator } from '#lib/languages/MIPS/MIPSEmulator.svelte.ts'
import { RISCVEmulator } from '#lib/languages/RISC-V/RISC-VEmulator.svelte.ts'
import { M68KEmulator } from '#lib/languages/M68K/M68KEmulator.svelte.ts'
import { Z80Emulator } from '#lib/languages/Z80/Z80Emulator.svelte.ts'
import { X86Emulator } from '#lib/languages/X86/X86Emulator.svelte.ts'
import type { ProgramSymbols } from './programSymbols'
import type { BuildSources } from '#lib/projectFiles.ts'
import { generatedAssemblyPath } from '#lib/sourceCompilation/records.ts'

/**
 * The labels and strings each real Core gives the Symbols panel after a Build
 * ([workbench.md](../../../../../docs/design/workbench.md), Symbols in every Target): code and
 * data, at the line that defines each, and the text its data starts with.
 */

const plain = (content: string) => ({ encoding: 'plain' as const, content })

/** What a test reads of the symbols: each label's name, kind and line, each string's text and line. */
function summary(symbols: ProgramSymbols | undefined) {
    return {
        labels: symbols?.labels.map((label) => [
            label.name,
            label.kind,
            label.definition && `${label.definition.file}:${label.definition.line}`
        ]),
        strings: symbols?.strings.map((string) => [
            string.label,
            string.text,
            string.definition && `${string.definition.file}:${string.definition.line}`
        ])
    }
}

const MARS_PROGRAM = [
    '.data',
    'prompt: .asciiz "Enter a number: "',
    'count:  .word 10',
    'table:  .word 1, 2, 3',
    'bare:   .ascii "no nul"',
    '        .byte 0xff',
    '.text',
    'main:',
    '    li $v0, 4',
    'loop: addi $t0, $t0, 1',
    '    j loop'
].join('\n')

describe('MARS and RARS', () => {
    it('lists the labels of a MIPS program, code and data, with their lines and its strings', async () => {
        const sources = { entry: 'main.s', files: { 'main.s': plain(MARS_PROGRAM) } }
        const emulator = MIPSEmulator(sources)
        await emulator.check()
        await emulator.compile(20, sources)
        expect(emulator.errors).toEqual([])
        expect(summary(emulator.programSymbols)).toEqual({
            labels: [
                ['main', 'code', 'main.s:7'],
                ['loop', 'code', 'main.s:9'],
                ['prompt', 'data', 'main.s:1'],
                ['count', 'data', 'main.s:2'],
                ['table', 'data', 'main.s:3'],
                ['bare', 'data', 'main.s:4']
            ],
            strings: [['prompt', 'Enter a number: ', 'main.s:1']]
        })
        const [, , prompt, count, table] = emulator.programSymbols!.labels
        //up to the next label, past the padding that aligns it
        expect(prompt.size).toBe(20n)
        expect(count.size).toBe(4n)
        expect(table.size).toBe(12n)
        emulator.clear()
        expect(emulator.programSymbols).toBeUndefined()
    })

    it('reads a label in an included File there, on RISC-V', async () => {
        const sources = {
            entry: 'main.s',
            files: {
                'main.s': plain('.include "data.s"\n.text\nmain:\n    la a0, hello\n'),
                'data.s': plain('.data\n# greeting\nhello: .string "Hi there"\n')
            }
        }
        const emulator = RISCVEmulator(sources)
        await emulator.check()
        await emulator.compile(20, sources)
        expect(emulator.errors).toEqual([])
        expect(summary(emulator.programSymbols)).toEqual({
            labels: [
                ['main', 'code', 'main.s:2'],
                ['hello', 'data', 'data.s:2']
            ],
            strings: [['hello', 'Hi there', 'data.s:2']]
        })
    })
})

describe.each(['MIPS', 'RISC-V'] as const)('a compiled %s program', (target) => {
    it('lists only its own labels and strings, none of the Runtime library’s or the assembler’s', async () => {
        //GCC's output for the C File, linked with the real Runtime library, whose vfprintf is large
        //enough that the Core relaxes its far branches
        const directory = 'src/lib/sourceRuntime/fixtures/arguments'
        const entry = generatedAssemblyPath('main.c', target)
        const sources: BuildSources = {
            entry,
            entrySource: 'main.c',
            entrySymbol: '_start',
            runtimeAbi: 'v1',
            assemblerProfile: 'gnu-compiler-v1',
            compiledLanguages: { [entry]: 'c' },
            files: {
                'main.c': plain(readFileSync(`${directory}/main.c`, 'utf8')),
                [entry]: plain(readFileSync(`${directory}/${target}.s`, 'utf8'))
            }
        }
        const emulator =
            target === 'MIPS'
                ? MIPSEmulator(sources, { automaticChecking: false })
                : RISCVEmulator(sources, { automaticChecking: false, language: target })
        try {
            await emulator.compile(20, sources)
            expect(emulator.errors).toEqual([])
            const { labels, strings } = emulator.programSymbols!
            expect(labels.map((label) => [label.name, label.kind, label.definition?.file])).toEqual(
                [['main', 'code', entry]]
            )
            //it ends where the library's code starts, not at the end of the program's code
            expect(labels[0].size).toBeLessThan(400n)
            expect(strings.map((string) => string.text)).toEqual(['argc=%d\n', 'argv[%d]=%s\n'])
            expect(strings.every((string) => string.definition?.file === entry)).toBe(true)
        } finally {
            emulator.dispose()
        }
    })
})

describe('the other Cores', () => {
    it('takes the M68K labels where s68k read them', async () => {
        const code = [
            '    org $1000',
            'start:',
            '    lea msg,a1',
            '.loop:',
            '    bra .loop',
            "msg: dc.b 'Hello, M68K',0",
            '    end start'
        ].join('\n')
        const emulator = M68KEmulator(code)
        await emulator.compile(20, undefined)
        expect(emulator.errors).toEqual([])
        //a local label under its global, as s68k names it
        expect(summary(emulator.programSymbols)).toEqual({
            labels: [
                ['start', 'code', 'main:1'],
                ['start:loop', 'code', 'main:3'],
                ['msg', 'data', 'main:5']
            ],
            strings: [['msg', 'Hello, M68K', 'main:5']]
        })
    })

    it('takes the Z80 labels where the assembler defined them', async () => {
        const sources = {
            entry: 'main.asm',
            files: {
                'main.asm': plain(
                    [
                        '    org $8000',
                        'start:',
                        '    ld hl, msg',
                        '    halt',
                        'COUNT equ 3',
                        'msg: defm "Hello Z80"',
                        '    db 0'
                    ].join('\n')
                )
            }
        }
        const emulator = Z80Emulator(sources)
        await emulator.compile(20, sources)
        expect(emulator.errors).toEqual([])
        expect(summary(emulator.programSymbols)).toEqual({
            labels: [
                ['start', 'code', 'main.asm:1'],
                ['msg', 'data', 'main.asm:5']
            ],
            strings: [['msg', 'Hello Z80', 'main.asm:5']]
        })
    })

    it('lists an assembled x86 program, NASM labels without their colon included', async () => {
        const sources = {
            entry: 'main.asm',
            files: {
                'main.asm': plain(
                    [
                        'global _start',
                        'section .data',
                        'msg db "Hello, x86", 10, 0',
                        'value: dq 5',
                        'section .text',
                        '_start:',
                        '    mov rax, 60',
                        '.done:',
                        '    xor rdi, rdi',
                        '    syscall'
                    ].join('\n')
                )
            }
        }
        const emulator = await X86Emulator(sources, { automaticChecking: false })
        try {
            await emulator.compile(20, sources)
            expect(emulator.errors).toEqual([])
            expect(summary(emulator.programSymbols)).toEqual({
                labels: [
                    ['_start', 'code', 'main.asm:5'],
                    ['_start.done', 'code', 'main.asm:7'],
                    ['msg', 'data', 'main.asm:2'],
                    ['value', 'data', 'main.asm:3']
                ],
                strings: [['msg', 'Hello, x86\n', 'main.asm:2']]
            })
        } finally {
            emulator.dispose()
        }
    }, 60_000)
})
