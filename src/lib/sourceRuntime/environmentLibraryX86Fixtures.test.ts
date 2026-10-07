import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { GCC_INTEL_V1 } from '@specy/x86/compiler-output'
import { X86Emulator } from '$lib/languages/X86/X86Emulator.svelte'
import type { Testcase } from '$lib/Project.svelte'
import type { ProjectFiles } from '$lib/projectFiles'
import {
    compileSource,
    createCompilerRequest,
    SourceCompilationError,
    type CompilationRequest
} from '$lib/sourceCompilation/compilerExplorer'
import {
    cleanCompilationRecords,
    generatedAssemblyPath,
    type Optimization
} from '$lib/sourceCompilation/records'
import { CURRENT_RUNTIME_ABI } from '$lib/runtimeAbi'
import { loadRuntimeHeaders } from './runtimeLibrary'
import { ENVIRONMENT_HEADER_PATH } from './environmentLibrary'

/**
 * x86's `<sim.h>` as the editor compiles it: programs captured from Compiler Explorer by
 * `scripts/sim-header/capture-fixtures.mjs`, GCC 14.2 at `-O0` and `-O2` in C and C++, prepared by
 * the real Compile path, translated to NASM by the Core's translator and run through the editor's
 * x86 Emulator with its Start unit. No test needs network access.
 *
 */

type Fixture = {
    program: 'linux-calls' | 'compiled-out'
    target: 'X86'
    compiler: 'gcc'
    optimization: Optimization
    sourcePath: string
    source: string
    compilerId: string
    userArguments: string
    response: { code: number; stderr: { text: string }[]; lines: [string][] }
}

const fixtures = Object.entries(
    import.meta.glob<Fixture>('./fixtures/sim/x86/*.json', { eager: true, import: 'default' })
).map(([path, fixture]) => ({ ...fixture, name: path.replace(/^.*\/|\.json$/g, '') }))
const named = (program: Fixture['program']) =>
    fixtures
        .filter((fixture) => fixture.program === program)
        .map((fixture) => [fixture.name, fixture] as const)

const header = readFileSync('src/lib/sourceRuntime/generated/sim/x86_64.h', 'utf8')

function requestFor(fixture: Fixture): CompilationRequest {
    const files: ProjectFiles = {
        [fixture.sourcePath]: { encoding: 'plain', content: fixture.source }
    }
    return {
        sourcePath: fixture.sourcePath,
        outputPath: generatedAssemblyPath(fixture.sourcePath, 'X86'),
        files,
        target: 'X86',
        optimization: fixture.optimization
    }
}

function compile(fixture: Fixture) {
    const response = {
        code: fixture.response.code,
        stderr: fixture.response.stderr,
        asm: fixture.response.lines.map(([text]) => ({ text, source: null }))
    }
    const fetcher = vi.fn(async () => new Response(JSON.stringify(response)))
    return { fetcher, result: compileSource(requestFor(fixture), undefined, fetcher) }
}

describe('the captured x86 <sim.h> compiles', () => {
    it('cover C and C++ at -O0 and -O2', () => {
        expect(
            named('linux-calls')
                .map(([name]) => name)
                .sort()
        ).toEqual([
            'linux-calls-x86-gcc-O0',
            'linux-calls-x86-gcc-O2',
            'linux-calls-x86-gcc-cpp-O0',
            'linux-calls-x86-gcc-cpp-O2'
        ])
    })

    it.each(fixtures.map((fixture) => [fixture.name, fixture] as const))(
        '%s was asked for as the editor asks',
        async (_, fixture) => {
            const sysroot = {
                ...(await loadRuntimeHeaders(CURRENT_RUNTIME_ABI)),
                'sim.h': header
            }
            const prepared = createCompilerRequest(requestFor(fixture), sysroot, GCC_INTEL_V1)
            expect(prepared.compilerId).toBe(fixture.compilerId)
            expect(prepared.body.options.userArguments).toBe(fixture.userArguments)
            //and what compileSource sends is that request, `<sim.h>` included
            const { fetcher, result } = compile(fixture)
            await result.catch(() => undefined)
            const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
            const body = JSON.parse(String(init.body))
            expect(body.options.userArguments).toBe(fixture.userArguments)
            const files = body.files as { filename: string; contents: string }[]
            expect(files.find((file) => file.filename === 'sysroot/include/sim.h')?.contents).toBe(
                header
            )
            expect(files.map((file) => file.filename)).not.toContain('sysroot/include/stdio.h')
        }
    )
})

describe('a call the x86 Core does not implement', () => {
    it.each(named('compiled-out'))('%s is a compile error naming its function', async (_, f) => {
        const error = await compile(f).result.catch((caught: unknown) => caught)
        expect(error).toBeInstanceOf(SourceCompilationError)
        const failures = (error as SourceCompilationError).diagnostics.filter(
            (item) => item.severity === 'error'
        )
        expect(failures).toHaveLength(1)
        const [failure] = failures
        //where the program calls it, rather than an ENOSYS when it runs
        expect(failure.file).toBe(f.sourcePath)
        expect(failure.lineIndex).toBe(3)
        expect(failure.column).toBe(18)
        expect(failure.line.line).toBe('    long child = sim_fork();')
        expect(failure.message).toMatch(
            f.sourcePath.endsWith('.cpp')
                ? /^'sim_fork' was not declared in this scope/
                : /^implicit declaration of function 'sim_fork'/
        )
    })
})

/**
 * The program's answer, then its output: the scripted line is not echoed, as piped standard input
 * is not. Its exit status is the length of the line it read, newline included.
 */
const LINUX_CALLS_TESTCASE: Testcase = {
    input: ['world'],
    expectedOutput: 'name? hello world\npid positive\nclock 0 ok\nbad descriptor -9\n',
    startingRegisters: {},
    expectedRegisters: {},
    startingMemory: [],
    expectedMemory: []
}

describe('a program making Linux system calls from C', () => {
    it.each(named('linux-calls'))(
        '%s maps into @runtime/include/sim.h, records only the source, and runs',
        async (_, fixture) => {
            const request = requestFor(fixture)
            const compiled = await compile(fixture).result
            expect(compiled.diagnostics).toEqual([])
            const assembly = compiled.assembly.split('\n')
            expect(compiled.map.lines).toHaveLength(assembly.length)
            //every system call is the header's `__asm__`, inlined at -O2, a local function at -O0
            const headerLines = header.split('\n')
            const calls = assembly.flatMap((line, index) =>
                /^\s*syscall\b/.test(line) ? [index] : []
            )
            expect(calls.length).toBeGreaterThanOrEqual(5)
            for (const index of calls) {
                const location = compiled.map.lines[index]
                expect(location?.path).toBe(ENVIRONMENT_HEADER_PATH)
                expect(headerLines[location!.line]).toContain('__asm__ volatile("syscall"')
            }
            if (fixture.optimization === '0')
                expect(assembly).toEqual(expect.arrayContaining(['sim_write:', 'sim_exit_group:']))
            else expect(compiled.assembly).not.toMatch(/^sim_\w+:/m)
            //the header is the editor's: no input, no fingerprint, and the record stays valid
            expect(Object.keys(compiled.record.inputs)).toEqual([fixture.sourcePath])
            expect(cleanCompilationRecords([compiled.record])).toHaveLength(1)

            //built as the Workbench builds compiled code: from `_start`, the Start unit's
            const sources = {
                entry: request.outputPath,
                entrySymbol: '_start',
                files: {
                    ...request.files,
                    [request.outputPath]: { encoding: 'plain' as const, content: compiled.assembly }
                }
            }
            const emulator = await X86Emulator(sources, { automaticChecking: false })
            try {
                const [outcome] = await emulator.test(sources, [LINUX_CALLS_TESTCASE], 1_000_000)
                expect(emulator.errors).toEqual([])
                expect(outcome?.errors ?? []).toEqual([])
                expect(outcome?.passed).toBe(true)
                expect(emulator.terminated).toBe(true)
                //exit_group ended the program with the length read, which stays in rdi
                const rdi = emulator.registers.find((register) => register.name === 'rdi')
                expect(Number(rdi?.value)).toBe('world\n'.length)
            } finally {
                emulator.dispose()
            }
        },
        30_000
    )
})
