/**
 * The Arguments an x86 program starts with, through the Emulator: `argv[0]` is the program as typed
 * in a shell, `./crackme` or `./main` for `main.asm`, and the Project's Arguments, or a Testcase's
 * own, follow it ([binary-import.md](../../../../../../docs/design/binary-import.md), decision 12,
 * milestone M10 of the plan).
 */
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { TESTCASE_INSTRUCTION_LIMIT } from '#lib/Config.ts'
import type { Testcase } from '#lib/Project.svelte.ts'
import type { BuildSources } from '#lib/projectFiles.ts'
import { X86Emulator } from './X86Emulator.svelte'

const fixtureBytes = (name: string) =>
    readFileSync(new URL(`../../../../../x86/blink-js/tests/fixtures/elf/${name}`, import.meta.url))

function executableSources(name: string, entry = name): BuildSources {
    const content = Buffer.from(fixtureBytes(name)).toString('base64')
    return { entry, files: { [entry]: { encoding: 'base64', content } } }
}

function assembledSources(code: string, entry = 'main.asm'): BuildSources {
    return { entry, files: { [entry]: { encoding: 'plain', content: code } } }
}

const testcase = (part: Partial<Testcase>): Testcase => ({
    input: [],
    expectedOutput: '',
    startingRegisters: {},
    expectedRegisters: {},
    startingMemory: [],
    expectedMemory: [],
    ...part
})

const emulators: { dispose(): void }[] = []
afterEach(() => emulators.splice(0).forEach((emulator) => emulator.dispose()))

async function emulatorFor(sources: BuildSources, programArguments?: string) {
    const emulator = await X86Emulator(sources, { automaticChecking: false, programArguments })
    emulators.push(emulator)
    return emulator
}

type Emulator = Awaited<ReturnType<typeof emulatorFor>>

/** Builds and runs to the end, answering no input, and gives what the program wrote. */
async function output(emulator: Emulator, sources: BuildSources) {
    await emulator.compile(0, sources)
    expect(emulator.errors).toEqual([])
    await emulator.run(0)
    expect(emulator.terminated).toBe(true)
    return emulator.stdOut
}

/**
 * A NUL-terminated string of the program's memory, read a byte at a time: the strings `argv`
 * points to end a few bytes below the top of the stack, past which nothing is mapped.
 */
function cString(emulator: Emulator, address: bigint): string {
    const bytes: number[] = []
    for (let at = address; bytes.length < 4096; at++) {
        const [byte] = emulator.readMemoryBytes(at, 1)
        if (byte === 0) break
        bytes.push(byte)
    }
    return new TextDecoder().decode(Uint8Array.from(bytes))
}

function qword(emulator: Emulator, address: bigint): bigint {
    const bytes = emulator.readMemoryBytes(address, 8)
    return new DataView(bytes.buffer, bytes.byteOffset, 8).getBigUint64(0, true)
}

/** `argc` and `argv` as Linux leaves them at `_start`: `argc` at `rsp`, the pointers after it. */
function startArguments(emulator: Emulator): string[] {
    const sp = emulator.sp
    const argc = Number(qword(emulator, sp))
    return Array.from({ length: argc }, (_, i) =>
        cString(emulator, qword(emulator, sp + 8n * BigInt(i + 1)))
    )
}

const EXIT =
    'global _start\nsection .text\n_start:\n    mov eax, 60\n    xor edi, edi\n    syscall\n'

describe('argv[0]', () => {
    it('is ./ and the Entry path of an Executable', async () => {
        const sources = executableSources('hello-atexit')
        const emulator = await emulatorFor(sources)
        expect(await output(emulator, sources)).toBe(
            'hello ./hello-atexit argc=1\natexit handler\n'
        )
    })

    it('follows the name the Executable has in the Project', async () => {
        const sources = executableSources('hello-atexit-static', 'bin/hello')
        const emulator = await emulatorFor(sources)
        expect(await output(emulator, sources)).toBe('hello ./bin/hello argc=1\natexit handler\n')
    })

    it('is ./ and the Entry path without its extension of an assembled program', async () => {
        for (const entry of ['main.asm', 'src/game.s', 'main']) {
            const sources = assembledSources(EXIT, entry)
            const emulator = await emulatorFor(sources)
            await emulator.compile(0, sources)
            expect(emulator.errors).toEqual([])
            expect(startArguments(emulator)).toEqual([`./${entry.replace(/\.[^./]*$/, '')}`])
        }
    })
})

describe('argv[0] of a compiled program', () => {
    it('is ./ and the source File it was compiled from, without its extension', async () => {
        //main's argv[0], read where the Build stops: argv is in rsi
        const main = [
            '    global main',
            '    section .text',
            'main:',
            '    xor eax, eax',
            '    ret'
        ]
        for (const [source, entry] of [
            ['main.c', 'main.c.asm'],
            ['src/game.cpp', 'src/game.cpp.asm']
        ]) {
            const sources: BuildSources = {
                entry,
                entrySymbol: '_start',
                entrySource: source,
                files: { [entry]: { encoding: 'plain', content: main.join('\n') } }
            }
            const emulator = await emulatorFor(sources)
            await emulator.compile(0, sources)
            expect(emulator.errors).toEqual([])
            const cpu = emulator.registerFiles.find((file) => file.id === 'cpu')!
            const rsi = cpu.registers.find((register) => register.name === 'rsi')!.value
            expect(cString(emulator, qword(emulator, rsi))).toBe(
                `./${source.replace(/\.[^./]*$/, '')}`
            )
        }
    })
})

describe('the Project Arguments', () => {
    it('reach an Executable after argv[0], split as a shell splits them', async () => {
        const sources = executableSources('argv-env')
        const emulator = await emulatorFor(sources, `hunter2 "two words" 'it''s' a\\ b`)
        const lines = (await output(emulator, sources)).split('\n')
        expect(lines.filter((line) => line.startsWith('argv'))).toEqual([
            'argv[0]=./argv-env',
            'argv[1]=hunter2',
            'argv[2]=two words',
            'argv[3]=its',
            'argv[4]=a b'
        ])
    })

    it('reach an assembled program, and follow setProgramArguments from the next Build', async () => {
        const sources = assembledSources(EXIT)
        const emulator = await emulatorFor(sources, 'one')
        await emulator.compile(0, sources)
        expect(startArguments(emulator)).toEqual(['./main', 'one'])
        emulator.setProgramArguments('two "and three"')
        //a Setting takes effect at the next Build, never under a running program
        expect(startArguments(emulator)).toEqual(['./main', 'one'])
        await emulator.compile(0, sources)
        expect(startArguments(emulator)).toEqual(['./main', 'two', 'and three'])
        emulator.setProgramArguments('')
        await emulator.compile(0, sources)
        expect(startArguments(emulator)).toEqual(['./main'])
    })

    it('that do not parse stop the Build with an error Diagnostic of no File', async () => {
        const sources = assembledSources(EXIT)
        const emulator = await emulatorFor(sources, 'ok "never closed')
        await expect(emulator.compile(0, sources)).rejects.toThrow(
            'Arguments: The double quote (") at column 4 is never closed'
        )
        expect(emulator.canExecute).toBe(false)
        expect(emulator.compilerDiagnostics).toEqual([
            expect.objectContaining({
                severity: 'error',
                source: 'Arguments',
                message: 'Arguments: The double quote (") at column 4 is never closed'
            })
        ])
        expect(emulator.compilerDiagnostics[0].file).toBeUndefined()
    })

    it('that the Core refuses stop the Build with its reason', async () => {
        const sources = executableSources('crackme-argv')
        const emulator = await emulatorFor(sources, Array(1025).fill('x').join(' '))
        await expect(emulator.compile(0, sources)).rejects.toThrow(
            'Arguments: Arguments may contain at most 1,024 words'
        )
        expect(emulator.canExecute).toBe(false)
    })
})

describe('Testcases with Arguments', () => {
    it('check a crackme that takes its password from argv[1]', async () => {
        const sources = executableSources('crackme-argv')
        const emulator = await emulatorFor(sources)
        const results = await emulator.test(
            sources,
            [
                testcase({ arguments: 'hunter2', expectedOutput: 'Correct!\n' }),
                testcase({ arguments: 'swordfish', expectedOutput: 'Wrong!\n' }),
                testcase({ arguments: '"hunter2 "', expectedOutput: 'Wrong!\n' }),
                testcase({ expectedOutput: 'Wrong!\n' })
            ],
            TESTCASE_INSTRUCTION_LIMIT
        )
        expect(results.map((result) => result.errors)).toEqual([[], [], [], []])
    })

    it("run with the Project's Arguments when they have none of their own", async () => {
        const sources = executableSources('crackme-argv')
        const emulator = await emulatorFor(sources, 'hunter2')
        const results = await emulator.test(
            sources,
            [
                testcase({ expectedOutput: 'Correct!\n' }),
                testcase({ arguments: '', expectedOutput: 'Correct!\n' }),
                testcase({ arguments: 'nope', expectedOutput: 'Wrong!\n' })
            ],
            TESTCASE_INSTRUCTION_LIMIT
        )
        expect(results.map((result) => result.passed)).toEqual([true, true, true])
    })

    it('fail alone when their own Arguments do not parse', async () => {
        const sources = executableSources('crackme-argv')
        const emulator = await emulatorFor(sources)
        const results = await emulator.test(
            sources,
            [
                testcase({ arguments: "'hunter2", expectedOutput: 'Correct!\n' }),
                testcase({ arguments: 'hunter2', expectedOutput: 'Correct!\n' })
            ],
            TESTCASE_INSTRUCTION_LIMIT
        )
        expect(results).toHaveLength(2)
        expect(results[0].passed).toBe(false)
        expect(results[0].errors).toEqual([
            {
                type: 'runtime-error',
                message: "Arguments: The single quote (') at column 1 is never closed"
            }
        ])
        expect(results[1].passed).toBe(true)
    })

    it('reach an assembled program too', async () => {
        //exits with argc, so a Testcase can expect it in a register
        const code =
            'global _start\nsection .text\n_start:\n    mov rdi, [rsp]\n    mov r12, rdi\n    mov eax, 60\n    syscall\n'
        const sources = assembledSources(code)
        const emulator = await emulatorFor(sources, 'a b')
        const results = await emulator.test(
            sources,
            [
                testcase({ arguments: 'one two three', expectedRegisters: { r12: 4n } }),
                testcase({ expectedRegisters: { r12: 3n } })
            ],
            TESTCASE_INSTRUCTION_LIMIT
        )
        expect(results.map((result) => result.errors)).toEqual([[], []])
    })
})
