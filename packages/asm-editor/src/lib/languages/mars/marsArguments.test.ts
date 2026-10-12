/**
 * The Arguments a MIPS or RISC-V program starts with, through the Emulator and the real Cores:
 * `argv[0]` is the program as typed in a shell (`./main`), the Project's Arguments, or a
 * Testcase's own, follow it, and the Core stores them above the stack with argc in `a0` and argv
 * in `a1`, leaving the stack pointer where it always starts
 * ([ADR 0046](../../../../../../docs/adr/0046-mips-and-risc-v-programs-get-argv-above-their-stack.md)).
 */
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { TESTCASE_INSTRUCTION_LIMIT } from '#lib/Config.ts'
import type { Testcase } from '#lib/Project.svelte.ts'
import type { BuildSources } from '#lib/projectFiles.ts'
import { MIPSEmulator } from '#lib/languages/MIPS/MIPSEmulator.svelte.ts'
import { RISCVEmulator } from '#lib/languages/RISC-V/RISC-VEmulator.svelte.ts'
import { generatedAssemblyPath } from '#lib/sourceCompilation/records.ts'

type Target = 'MIPS' | 'RISC-V' | 'RISC-V-64'
const TARGETS: Target[] = ['MIPS', 'RISC-V', 'RISC-V-64']

const INSTRUCTION_LIMIT = 1_000_000
const STACK_POINTER = 0x7fffeffcn

/** Prints argc, then each argv string on a line of its own, walking argv to its NULL. */
const PRINT_ARGV: Record<Target, string> = {
    MIPS: `
main:   move $s0, $a0
        move $s1, $a1
        li   $v0, 1
        syscall
next:   lw   $t0, 0($s1)
        beqz $t0, done
        li   $a0, 10
        li   $v0, 11
        syscall
        move $a0, $t0
        li   $v0, 4
        syscall
        addi $s1, $s1, 4
        j    next
done:   li   $v0, 10
        syscall
`,
    'RISC-V': riscvPrintArgv('lw', 4),
    'RISC-V-64': riscvPrintArgv('ld', 8)
}

function riscvPrintArgv(load: string, size: number) {
    return `
main:   mv   s0, a0
        mv   s1, a1
        li   a7, 1
        ecall
next:   ${load} t0, 0(s1)
        beqz t0, done
        li   a0, 10
        li   a7, 11
        ecall
        mv   a0, t0
        li   a7, 4
        ecall
        addi s1, s1, ${size}
        j    next
done:   li   a7, 10
        ecall
`
}

const source = (code: string, entry = 'main.s'): BuildSources => ({
    entry,
    files: { [entry]: { encoding: 'plain', content: code } }
})

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

async function emulatorFor(target: Target, sources: BuildSources, programArguments?: string) {
    const options = { automaticChecking: false, programArguments }
    const emulator =
        target === 'MIPS'
            ? MIPSEmulator(sources, options)
            : RISCVEmulator(sources, { ...options, language: target })
    emulators.push(emulator)
    return emulator
}

type Emulator = Awaited<ReturnType<typeof emulatorFor>>

const register = (emulator: Emulator, name: string) =>
    emulator.registers.find((candidate) => candidate.name === name)?.value

/** `a0` and `a1` as each Target spells them. */
const argumentRegisters = (target: Target) => (target === 'MIPS' ? ['$a0', '$a1'] : ['a0', 'a1'])

/** Builds and runs to the end, answering no input, and gives what the program wrote. */
async function output(emulator: Emulator, sources: BuildSources) {
    await emulator.compile(0, sources)
    expect(emulator.errors).toEqual([])
    await emulator.run(INSTRUCTION_LIMIT)
    expect(emulator.terminated).toBe(true)
    return emulator.stdOut
}

describe.each(TARGETS)('%s programs', (target) => {
    const [a0, a1] = argumentRegisters(target)

    it('read argc in a0 and argv in a1: the program name, then the Project Arguments', async () => {
        const sources = source(PRINT_ARGV[target])
        const emulator = await emulatorFor(target, sources, 'hello "two words"')
        expect(await output(emulator, sources)).toBe('3\n./main\nhello\ntwo words')
    })

    it('are named after their Entry path without its extension, with argc 1 and no Arguments', async () => {
        const sources = source(PRINT_ARGV[target], 'src/game.asm')
        const emulator = await emulatorFor(target, sources)
        expect(await output(emulator, sources)).toBe('1\n./src/game')
    })

    it('start with the stack pointer where they always do, with or without Arguments', async () => {
        const sources = source(PRINT_ARGV[target])
        for (const text of ['', 'hello "two words"', 'x'.repeat(3000)]) {
            const emulator = await emulatorFor(target, sources, text)
            await emulator.compile(0, sources)
            expect(emulator.sp, text).toBe(STACK_POINTER)
            //the pointers and strings are above it, below the stack base
            const argv = register(emulator, a1)!
            expect(argv).toBeGreaterThan(STACK_POINTER)
            expect(argv).toBeLessThan(0x7ffffffcn)
        }
    })

    it('find argv above the stack, aligned to a pointer, NULL-terminated', async () => {
        const sources = source(PRINT_ARGV[target])
        const emulator = await emulatorFor(target, sources, 'hello "two words"')
        await emulator.compile(0, sources)
        const size = target === 'RISC-V-64' ? 8 : 4
        expect(register(emulator, a0)).toBe(3n)
        expect(register(emulator, a1)).toBe(size === 8 ? 0x7fffffc0n : 0x7fffffd4n)
        const bytes = emulator.readMemoryBytes(register(emulator, a1)!, 4 * size)
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        const pointers = [0, 1, 2, 3].map((i) =>
            size === 8 ? view.getBigUint64(i * 8, true) : BigInt(view.getUint32(i * 4, true))
        )
        expect(pointers).toEqual([0x7fffffe5n, 0x7fffffecn, 0x7ffffff2n, 0n])
    })

    it('follow setProgramArguments from the next Build', async () => {
        const sources = source(PRINT_ARGV[target])
        const emulator = await emulatorFor(target, sources, 'one')
        expect(await output(emulator, sources)).toBe('2\n./main\none')
        emulator.setProgramArguments("two 'and three'")
        expect(await output(emulator, sources)).toBe('3\n./main\ntwo\nand three')
        emulator.setProgramArguments('')
        expect(await output(emulator, sources)).toBe('1\n./main')
    })

    it('keep argc and argv when Undo goes back to the start', async () => {
        const code =
            target === 'MIPS'
                ? 'main: li $a0, 99\n      li $a1, 98\n      addi $sp, $sp, -8\n'
                : 'main: li a0, 99\n      li a1, 98\n      addi sp, sp, -16\n'
        const sources = source(code)
        const emulator = await emulatorFor(target, sources, 'a b')
        await emulator.compile(100, sources)
        const argv = register(emulator, a1)
        for (let i = 0; i < 3; i++) await emulator.step()
        expect(register(emulator, a0)).toBe(99n)
        emulator.undo(3)
        expect([register(emulator, a0), register(emulator, a1), emulator.sp]).toEqual([
            3n,
            argv,
            STACK_POINTER
        ])
    })

    it('that do not fit stop the Build with the Core reason, as an Arguments problem', async () => {
        const sources = source(PRINT_ARGV[target])
        const name = target === 'MIPS' ? 'MIPS' : 'RISC-V'
        const emulator = await emulatorFor(target, sources, 'x'.repeat(5000))
        await expect(emulator.compile(0, sources)).rejects.toThrow(
            new RegExp(
                `^Arguments: Arguments take 5,0\\d\\d bytes with the program name and argv; ${name} programs have 4,080 bytes for them$`
            )
        )
        expect(emulator.canExecute).toBe(false)
        expect(emulator.compilerDiagnostics).toEqual([
            expect.objectContaining({ severity: 'error', source: 'Arguments' })
        ])
        const words = await emulatorFor(target, sources, Array(1025).fill('x').join(' '))
        await expect(words.compile(0, sources)).rejects.toThrow(
            'Arguments: Arguments may contain at most 1,024 words'
        )
    })

    it('take their own Arguments in a Testcase, or else the Project ones', async () => {
        const sources = source(PRINT_ARGV[target])
        const emulator = await emulatorFor(target, sources, 'project')
        const results = await emulator.test(
            sources,
            [
                testcase({
                    arguments: 'hunter2 "two words"',
                    expectedOutput: '3\n./main\nhunter2\ntwo words'
                }),
                testcase({ expectedOutput: '2\n./main\nproject' }),
                testcase({ arguments: "'open", expectedOutput: '' })
            ],
            TESTCASE_INSTRUCTION_LIMIT
        )
        expect(results.map((result) => result.errors)).toEqual([
            [],
            [],
            [
                {
                    type: 'runtime-error',
                    message: "Arguments: The single quote (') at column 1 is never closed"
                }
            ]
        ])
    })
})

describe('MIPS Testcases', () => {
    it('set their starting registers after argc and argv', async () => {
        const code = 'main: move $s0, $a0\n      move $s1, $a1\n'
        const sources = source(code)
        const emulator = await emulatorFor('MIPS', sources)
        const results = await emulator.test(
            sources,
            [
                testcase({ arguments: 'a b', expectedRegisters: { $s0: 3n, $s1: 0x7fffffe0n } }),
                testcase({ startingRegisters: { $a0: 7n }, expectedRegisters: { $s0: 7n } })
            ],
            TESTCASE_INSTRUCTION_LIMIT
        )
        expect(results.map((result) => result.errors)).toEqual([[], []])
    })
})

/**
 * A C program compiled for each Target by GCC 14.2 at -O0 through Compiler Explorer, as the editor
 * compiles it, and kept as its Generated assembly (`src/lib/sourceRuntime/fixtures/arguments`, the
 * source beside it): linked with the real Runtime library, whose `_start` hands `main` the argc
 * and argv the Core stored.
 */
describe.each(TARGETS)('a compiled %s program', (target) => {
    it('gets argc and argv in main, named after its C File', async () => {
        const directory = 'src/lib/sourceRuntime/fixtures/arguments'
        const entry = generatedAssemblyPath('main.c', target)
        const sources: BuildSources = {
            entry,
            entrySource: 'main.c',
            entrySymbol: '_start',
            runtimeAbi: 'v1',
            assemblerProfile: 'gnu-compiler-v1',
            files: {
                'main.c': {
                    encoding: 'plain',
                    content: readFileSync(`${directory}/main.c`, 'utf8')
                },
                [entry]: {
                    encoding: 'plain',
                    content: readFileSync(`${directory}/${target}.s`, 'utf8')
                }
            }
        }
        const emulator = await emulatorFor(target, sources, 'hello "two words"')
        expect(await output(emulator, sources)).toBe(
            'argc=3\nargv[0]=./main\nargv[1]=hello\nargv[2]=two words\n'
        )
        //main returns 0 when argv[argc] is NULL
        expect(emulator.termination).toMatchObject({ kind: 'exit', code: 0 })
    })
})
