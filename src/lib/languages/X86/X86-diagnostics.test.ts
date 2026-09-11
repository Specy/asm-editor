import { describe, expect, it } from 'vitest'
import { X86Emulator } from './X86Emulator.svelte'
import { X86_DIAGNOSTIC_HINTS, x86DiagnosticHint } from './X86-diagnostics'

const sourcesOf = (content: string) => ({
    entry: 'main.asm',
    files: { 'main.asm': { encoding: 'plain' as const, content } }
})

describe('x86 diagnostic hints', () => {
    it('explains a warning class, and stays quiet about one it does not know', () => {
        expect(x86DiagnosticHint('label-orphan')).toContain('needs a colon')
        expect(x86DiagnosticHint('a-class-nasm-has-never-heard-of')).toBeUndefined()
        expect(x86DiagnosticHint(undefined)).toBeUndefined()
    })

    it('writes every hint as a sentence the reader can act on', () => {
        for (const [warningClass, hint] of Object.entries(X86_DIAGNOSTIC_HINTS)) {
            expect(hint, warningClass).toMatch(/[.?]$/)
            expect(hint.length, warningClass).toBeGreaterThan(30)
        }
    })
})

describe('what the editor shows for x86', () => {
    it('carries the severity, class, column and explanation of a warning', async () => {
        const sources = sourcesOf(
            'bits 64\nglobal _start\nsection .text\n_start\n  mov rax, 60\n  syscall'
        )
        const emulator = await X86Emulator(sources, { automaticChecking: false })

        const diagnostics = await emulator._checkCode(sources)

        expect(diagnostics).toHaveLength(1)
        expect(diagnostics[0]).toMatchObject({
            severity: 'warning',
            file: 'main.asm',
            lineIndex: 3,
            code: 'label-orphan'
        })
        expect(diagnostics[0]?.hint).toContain('needs a colon')
        // The message the editor renders carries both, so the hover teaches.
        expect(diagnostics[0]?.formatted).toContain('label alone on a line')
        expect(diagnostics[0]?.formatted).toContain('needs a colon')
        emulator.dispose()
    })

    it('points a diagnostic at the symbol it is about', async () => {
        const sources = sourcesOf(
            'bits 64\nglobal _start\nsection .text\n_start:\n  mov rsi, msg\n  syscall'
        )
        const emulator = await X86Emulator(sources, { automaticChecking: false })

        const diagnostics = await emulator._checkCode(sources)

        expect(diagnostics[0]).toMatchObject({ severity: 'error', lineIndex: 4, column: 12 })
        emulator.dispose()
    })

    it('reports a missing entry point against the Entry file', async () => {
        const sources = sourcesOf('bits 64\nsection .text\nmain:\n  mov rax, 60\n  syscall')
        const emulator = await X86Emulator(sources, { automaticChecking: false })

        const diagnostics = await emulator._checkCode(sources)

        expect(diagnostics[0]).toMatchObject({
            severity: 'error',
            file: 'main.asm',
            code: 'entry-point'
        })
        expect(diagnostics[0]?.hint).toContain('`main` begins a C program')
        emulator.dispose()
    })

    it('leaves a correct program without diagnostics', async () => {
        const sources = sourcesOf(
            'bits 64\nglobal _start\nsection .text\n_start:\n  mov rax, 60\n  xor rdi, rdi\n  syscall'
        )
        const emulator = await X86Emulator(sources, { automaticChecking: false })

        expect(await emulator._checkCode(sources)).toEqual([])
        emulator.dispose()
    })
})
