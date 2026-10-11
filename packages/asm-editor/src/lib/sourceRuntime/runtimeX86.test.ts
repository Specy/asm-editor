import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runtimeRoot } from '@asm-editor/runtime/paths'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { X86Emulator } from '#lib/languages/X86/X86Emulator.svelte.ts'
import { FileSystem } from '#lib/languages/peripherals/FileSystem.ts'
import { preferencesStore } from '#stores/preferencesStore.svelte.ts'
import type { BuildSources } from '#lib/projectFiles.ts'

const plain = (content: string) => ({ encoding: 'plain' as const, content })
afterEach(() => {
    preferencesStore.values.stepIntoRuntimeLibrary.value = false
})

describe('the x86 runtime in the editor', () => {
    it.each([
        'printf_int',
        'scanf_int',
        'allocation_alignment',
        'cpp_global_objects',
        'exit_status'
    ])(
        '%s runs the frozen ABI program through the editor and its peripherals',
        async (name) => {
            const path = join(runtimeRoot, 'abi', 'v1-fixtures', 'x86_64', name)
            const fixture = JSON.parse(readFileSync(`${path}.json`, 'utf8'))
            const sources: BuildSources = {
                entry: 'main.asm',
                entrySymbol: '_start',
                runtimeAbi: 'v1',
                files: { 'main.asm': plain(readFileSync(`${path}.s`, 'utf8')) }
            }
            const emulator = await X86Emulator(sources, { automaticChecking: false })
            try {
                const [result] = await emulator.test(
                    sources,
                    [
                        {
                            input:
                                fixture.stdin === null ? [] : fixture.stdin.trimEnd().split('\n'),
                            expectedOutput: Buffer.from(fixture.stdout, 'base64')
                                .toString()
                                .replace(
                                    'stderr returned',
                                    Buffer.from(fixture.stderr, 'base64').toString() +
                                        'stderr returned'
                                ),
                            startingRegisters: {},
                            expectedRegisters: {},
                            startingMemory: [],
                            expectedMemory: []
                        }
                    ],
                    2_000_000
                )
                expect(emulator.errors).toEqual([])
                expect(result.errors).toEqual([])
                expect(result.passed).toBe(true)
                expect(emulator.termination).toMatchObject({ kind: 'exit', code: fixture.status })
                expect(Object.keys(emulator.buildLibraryFiles ?? {})).toContain(
                    '@runtime/v1/crt0.s'
                )
            } finally {
                emulator.dispose()
            }
        },
        30_000
    )

    it('steps over fwrite and keeps its filesystem effect behind an Undo barrier', async () => {
        preferencesStore.values.stepIntoRuntimeLibrary.value = false
        const assembly = `default rel
global main
extern fopen
extern fwrite
extern fclose
section .text
main:
    push rbx
    lea rdi, [path]
    lea rsi, [mode]
    call fopen
    mov rbx, rax
    lea rdi, [message]
    mov esi, 1
    mov edx, 3
    mov rcx, rbx
    call fwrite
    mov rdi, rbx
    call fclose
    xor eax, eax
    pop rbx
    ret
section .rodata
path: db "result.txt", 0
mode: db "w", 0
message: db "abc"
`
        const sources: BuildSources = {
            entry: 'main.asm',
            files: { 'main.asm': plain(assembly) },
            entrySymbol: '_start',
            runtimeAbi: 'v1'
        }
        const files = new FileSystem()
        const emulator = await X86Emulator(sources, {
            automaticChecking: false,
            fileSystemHistoryBudgetMb: 8,
            peripherals: { fileSystem: files }
        })
        try {
            await emulator.compile(20_000, sources)
            const callLine = assembly.split('\n').indexOf('    call fwrite')
            for (let steps = 0; emulator.line !== callLine && steps < 30; steps++)
                await emulator.step()
            expect(emulator.line).toBe(callLine)
            expect(files.readText('result.txt')).toBe('')
            await emulator.step()
            expect(emulator.errors).toEqual([])
            expect(files.readText('result.txt')).toBe('abc')
            expect(emulator.latestSteps[0].stretch!.instructions).toBeGreaterThan(1)
            expect(emulator.latestSteps[0].undoable).toBe(false)
            expect(emulator.undo()).toBe(0)
            const pc = emulator._getPc()
            await emulator.step()
            expect(emulator.undo()).toBe(1)
            expect(emulator._getPc()).toBe(pc)
            expect(emulator.undo()).toBe(0)
            expect(files.readText('result.txt')).toBe('abc')
        } finally {
            emulator.dispose()
        }
    }, 30_000)

    it('steps over printf and undoes its CPU and memory changes as one call', async () => {
        const assembly = `default rel
global main
extern printf
section .text
main:
    sub rsp, 8
    lea rdi, [message]
    xor eax, eax
    call printf
    add rsp, 8
    xor eax, eax
    ret
section .rodata
message: db "printed", 10, 0
`
        const sources: BuildSources = {
            entry: 'main.asm',
            files: { 'main.asm': plain(assembly) },
            entrySymbol: '_start',
            runtimeAbi: 'v1'
        }
        const emulator = await X86Emulator(sources, { automaticChecking: false })
        try {
            await emulator.compile(20_000, sources)
            const callLine = assembly.split('\n').indexOf('    call printf')
            for (let steps = 0; emulator.line !== callLine && steps < 10; steps++)
                await emulator.step()
            expect(emulator.line).toBe(callLine)
            const pc = emulator._getPc()
            await emulator.step()
            expect(emulator.errors).toEqual([])
            expect(emulator.latestSteps[0].stretch!.instructions).toBeGreaterThan(1)
            expect(emulator.latestSteps[0].undoable).toBe(true)
            expect(emulator.undo()).toBe(1)
            expect(emulator._getPc()).toBe(pc)
            await emulator.step()
            expect(emulator.errors).toEqual([])
        } finally {
            emulator.dispose()
        }
    }, 30_000)

    it('says how to link the library when hand-written assembly calls printf without it', async () => {
        const sources: BuildSources = {
            entry: 'main.asm',
            files: {
                'main.asm': plain(
                    'global _start\nextern printf\nsection .text\n_start:\n call printf\n mov eax, 60\n syscall\n'
                )
            }
        }
        const emulator = await X86Emulator(sources, { automaticChecking: false })
        try {
            //x86 checks without linking, so the Build is what finds the undefined symbol
            await expect(emulator.compile(0, sources)).rejects.toThrow(/undefined reference/)
            const error = emulator.compilerErrors.find((item) => item.message.includes('printf'))
            expect(error?.hint).toMatch(/Link Runtime library/)
        } finally {
            emulator.dispose()
        }
    }, 30_000)

    it('uses a user hook before the runtime archive definition', async () => {
        const sources: BuildSources = {
            entry: 'main.asm',
            entrySymbol: '_start',
            runtimeAbi: 'v1',
            files: {
                'main.asm': plain(
                    'global main\nextern __cxa_pure_virtual\nsection .text\nmain:\n sub rsp,8\n call __cxa_pure_virtual\n add rsp,8\n ret\n'
                ),
                'hook.asm': plain(
                    'global __cxa_pure_virtual\nsection .text\n__cxa_pure_virtual:\n mov eax,42\n ret\n'
                )
            }
        }
        const emulator = await X86Emulator(sources, { automaticChecking: false })
        try {
            await emulator.compile(0, sources)
            expect(emulator.compilerErrors).toEqual([])
            await emulator.run(100_000)
            expect(emulator.errors).toEqual([])
            expect(emulator.termination).toMatchObject({ kind: 'exit', code: 42 })
        } finally {
            emulator.dispose()
        }
    }, 30_000)
})
