import { describe, expect, it } from 'vite-plus/test'
import { makeProject } from '#lib/Project.svelte.ts'
import { programBuildSources } from '#lib/buildSources.ts'
import { analyzeX86Project } from '#lib/languages/service/adapters/x86Adapter.ts'
import { fileFingerprint } from '#lib/sourceCompilation/fingerprints.ts'
import type { CompilationRecord } from '#lib/sourceCompilation/records.ts'
import { X86Emulator } from './X86Emulator.svelte'

/**
 * Hand-written assembly Files beside a C Program on x86 ([asmOS stage 2](../../../../../../docs/design/asmos-stage2.md),
 * decision 10): every `.asm`, `.s` and `.nasm` File no Program owns is a unit the Build may link, and the
 * Core assembles one only once the program needs a global it declares, so a File the program does
 * not need, whatever its mistakes, fails nothing and gets the Hint that it is not part of the program.
 */

/** Generated assembly of `int triple(int); int main(void) { return triple(14); }`. */
const MAIN = [
    '    global main',
    '    extern triple',
    '    section .text',
    'main:',
    '    mov edi, 14',
    '    call triple',
    '    ret'
].join('\n')
const TRIPLE = [
    '; triple(x), written by hand',
    '    global triple',
    '    section .text',
    'triple:',
    '    lea eax, [rdi + rdi*2]',
    '    ret'
].join('\n')
/** An exercise beside the program, in MIPS's syntax as MARS writes it, with a mistake besides. */
const EXERCISE = [
    '.data',
    'prompt: .asciiz "Number? "',
    '.text',
    '.globl main',
    'main:',
    '    li $v0, 4',
    '    la $a0, prompt',
    '    syscall',
    '    this line is wrong'
].join('\n')
const NOT_LINKED = "The program doesn't use this File, so it is left out."

const plain = (content: string) => ({ encoding: 'plain' as const, content })

function project(files: Record<string, string>) {
    const all: Record<string, ReturnType<typeof plain>> = {
        'main.c': plain('int triple(int);\nint main(void) { return triple(14); }\n'),
        ...Object.fromEntries(
            Object.entries({ 'main.c.asm': MAIN, ...files }).map(([path, content]) => [
                path,
                plain(content)
            ])
        )
    }
    const compilations: CompilationRecord[] = [
        {
            sourcePath: 'main.c',
            outputPath: 'main.c.asm',
            target: 'X86',
            language: 'c',
            compilerId: 'cg142',
            optimization: '0',
            inputs: { 'main.c': fileFingerprint(all['main.c'])! },
            outputFingerprint: fileFingerprint(all['main.c.asm'])!
        }
    ]
    return makeProject({ language: 'X86', files: all, entry: 'main.c.asm', compilations })
}

/** What `main`'s result, which the start code exits with, leaves in rdi. */
async function exitValue(emulator: Awaited<ReturnType<typeof X86Emulator>>): Promise<bigint> {
    await emulator.run(100_000)
    expect(emulator.terminated).toBe(true)
    const cpu = emulator.registerFiles.find((file) => file.id === 'cpu')!
    return cpu.registers.find((register) => register.name === 'rdi')!.value
}

describe('x86: hand-written Files beside a C Program', () => {
    it('calls a function written by hand in an .asm File', async () => {
        const sources = programBuildSources(project({ 'triple.asm': TRIPLE }))
        expect(sources.linkUnits).toEqual(['triple.asm'])
        const emulator = await X86Emulator(sources, { automaticChecking: false })
        try {
            expect(await emulator.check()).toEqual([])
            await emulator.compile(20, sources)
            expect(emulator.compilerDiagnostics).toEqual([])
            expect(await exitValue(emulator)).toBe(42n)
        } finally {
            emulator.dispose()
        }
    })

    it('calls a function written by hand in a .nasm File, as it did before Files joined by need', async () => {
        const sources = programBuildSources(project({ 'lib.nasm': TRIPLE }))
        expect(sources.linkUnits).toEqual(['lib.nasm'])
        const emulator = await X86Emulator(sources, { automaticChecking: false })
        try {
            await emulator.compile(20, sources)
            expect(emulator.compilerErrors).toEqual([])
            expect(await exitValue(emulator)).toBe(42n)
        } finally {
            emulator.dispose()
        }
    })

    it('leaves out an unrelated File in another syntax, with mistakes, that the program does not need', async () => {
        const sources = programBuildSources(
            project({
                'triple.asm': TRIPLE,
                'exercise.asm': EXERCISE,
                'notes.s': 'not assembly at all {'
            })
        )
        expect(sources.linkUnits).toEqual(['exercise.asm', 'notes.s', 'triple.asm'])
        const hint = (file: string) =>
            expect.objectContaining({
                file,
                severity: 'suggestion',
                code: 'not-linked',
                message: NOT_LINKED
            })
        const emulator = await X86Emulator(sources, { automaticChecking: false })
        try {
            //neither assembled, so neither has an error, in the check or the Build
            expect(await emulator.check()).toEqual([hint('exercise.asm'), hint('notes.s')])
            await emulator.compile(20, sources)
            expect(emulator.compilerErrors).toEqual([])
            expect(emulator.compilerDiagnostics).toEqual([hint('exercise.asm'), hint('notes.s')])
            expect(await exitValue(emulator)).toBe(42n)
        } finally {
            emulator.dispose()
        }
        //the live check counts them as not reached, and the File the program needs as assembled
        const snapshot = await analyzeX86Project(sources, 'hand-written', 1)
        expect(snapshot.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
        expect(snapshot.fileStatus['exercise.asm']).toBe('not-reachable')
        expect(snapshot.fileStatus['notes.s']).toBe('not-reachable')
        expect(snapshot.fileStatus['triple.asm']).toBe('assembled')
    })

    it('reports the mistakes of a File the program needs', async () => {
        const broken = TRIPLE.replace('lea eax, [rdi + rdi*2]', 'mov eax, rdi, rdi')
        const sources = programBuildSources(project({ 'triple.asm': broken }))
        const emulator = await X86Emulator(sources, { automaticChecking: false })
        try {
            expect((await emulator.check()).map((d) => [d.file, d.severity])).toEqual([
                ['triple.asm', 'error']
            ])
            await expect(emulator.compile(20, sources)).rejects.toThrow()
            expect(emulator.compilerErrors.map((d) => d.file)).toEqual(['triple.asm'])
        } finally {
            emulator.dispose()
        }
    })

    it("never takes another Program's Entry, nor what it includes, even for a name the program needs", async () => {
        const owner = project({
            'game.asm': [
                '%include "game/triple.inc"',
                'global _start',
                'section .text',
                '_start:',
                '    ret'
            ].join('\n'),
            'game/triple.inc': TRIPLE,
            'game/triple.asm': TRIPLE.replace('lea eax, [rdi + rdi*2]', 'mov eax, 1')
        })
        owner.createProgram('game.asm')
        const sources = programBuildSources(owner, 'main.c.asm')
        //game/triple.asm is no Program's and nothing of one includes it, so it is this one's
        expect(sources.linkUnits).toEqual(['game/triple.asm'])
        const emulator = await X86Emulator(sources, { automaticChecking: false })
        try {
            await emulator.compile(20, sources)
            expect(emulator.compilerErrors).toEqual([])
            expect(await exitValue(emulator)).toBe(1n)
        } finally {
            emulator.dispose()
        }
        //and a hand-written Entry takes it the same way, as x86 always has
        const handWritten = programBuildSources(owner, 'game.asm')
        expect(handWritten.linkUnits).toEqual(['game/triple.asm'])
    })
})
