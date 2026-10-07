import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { MIPSEmulator } from '$lib/languages/MIPS/MIPSEmulator.svelte'
import { RISCVEmulator } from '$lib/languages/RISC-V/RISC-VEmulator.svelte'
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
    type CompilationTarget,
    type Optimization,
    type SourceCompiler
} from '$lib/sourceCompilation/records'
import { CURRENT_RUNTIME_ABI } from '$lib/runtimeAbi'
import { loadRuntimeHeaders } from './runtimeLibrary'
import { ENVIRONMENT_HEADER_PATH } from './environmentLibrary'

/**
 * `<sim.h>` as the editor compiles it: programs captured from Compiler Explorer by
 * `scripts/sim-header/capture-fixtures.mjs`, for GCC and Clang at `-O0` and `-O2` on MIPS, RISC-V
 * and RISC-V-64, prepared by the real Compile path and run on the linked Cores. No test needs
 * network access.
 */

type Fixture = {
    program: 'services' | 'screen' | 'screen-large' | 'screen-too-large' | 'header-diagnostic'
    target: CompilationTarget
    compiler: SourceCompiler
    optimization: Optimization
    sourcePath: string
    source: string
    compilerId: string
    userArguments: string
    response: {
        code: number
        stderr: { text: string }[]
        /** `[text]`, or `[text, file, line]` and `true` for the main source. */
        lines: ([string] | [string, string | null, number | null, true?])[]
    }
}

const fixtures = Object.entries(
    import.meta.glob<Fixture>('./fixtures/sim/*.json', { eager: true, import: 'default' })
).map(([path, fixture]) => ({ ...fixture, name: path.replace(/^.*\/|\.json$/g, '') }))

const HEADER_FILES: Partial<Record<CompilationTarget, string>> = {
    MIPS: 'mips',
    'RISC-V': 'riscv32',
    'RISC-V-64': 'riscv64'
}
const header = (target: CompilationTarget) =>
    readFileSync(`src/lib/sourceRuntime/generated/sim/${HEADER_FILES[target]}.h`, 'utf8')

function requestFor(fixture: Fixture): CompilationRequest {
    const files: ProjectFiles = {
        [fixture.sourcePath]: { encoding: 'plain', content: fixture.source }
    }
    return {
        sourcePath: fixture.sourcePath,
        outputPath: generatedAssemblyPath(fixture.sourcePath, fixture.target),
        files,
        target: fixture.target,
        optimization: fixture.optimization,
        compiler: fixture.compiler
    }
}

/** What Compiler Explorer answered, rebuilt from the stored lines. */
function response(fixture: Fixture) {
    return {
        code: fixture.response.code,
        stderr: fixture.response.stderr,
        asm: fixture.response.lines.map(([text, file, line, mainsource]) =>
            file === undefined
                ? { text, source: null }
                : { text, source: { file, line, mainsource: mainsource === true } }
        )
    }
}

function compile(fixture: Fixture) {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(response(fixture))))
    return { fetcher, result: compileSource(requestFor(fixture), undefined, fetcher) }
}

async function built(fixture: Fixture) {
    const request = requestFor(fixture)
    const { result } = compile(fixture)
    const compiled = await result
    const sources = {
        assemblerProfile: compiled.record.assemblerProfile,
        runtimeAbi: compiled.record.runtimeAbi,
        entrySymbol: '_start',
        entry: request.outputPath,
        files: {
            ...request.files,
            [request.outputPath]: { encoding: 'plain' as const, content: compiled.assembly }
        }
    }
    const emulator =
        fixture.target === 'MIPS'
            ? MIPSEmulator(sources)
            : RISCVEmulator(sources, { language: fixture.target })
    await emulator.check()
    return { emulator, sources, compiled }
}

/**
 * The services program's answers, one line each in the order it asks: read int, float, double,
 * string and char, the confirm and input dialogs, then a key for the keyboard device. Its floats
 * are formatted by the Cores, and every Target exercises the seeded random and dialog services.
 */
function servicesTestcase(target: CompilationTarget): Testcase {
    const input = ['7', '0.5', '0.25', 'hello', 'x', 'yes', '5', '1.25', '3.5', 'text', 'k']
    const expected = [
        ...(target === 'MIPS' ? [] : ['/']),
        'print',
        '-42',
        '4294967295',
        '0x000000ff',
        '00000000000000000000000000000101',
        '1.5',
        '2.25',
        'int 42',
        '1.5',
        '2.25',
        //read string keeps the line's newline, as fgets does
        'hello',
        'x',
        'sbrk 11',
        //a Testcase's clock is virtual: the wait advances it by exactly what was asked
        'slept 25',
        'random 1',
        'descriptor 1',
        'written 4',
        'read 43',
        'seek 1',
        'dataata',
        'confirm 0',
        'dialog int 50',
        '1.25 0',
        '3.5 0',
        'dialog string 0',
        //the dialog's answer ends in a newline too, as service 8's does
        'text',
        '',
        'display 1',
        '!',
        'key 107'
    ]
    return {
        input,
        expectedOutput: expected.join('\n') + '\n',
        startingRegisters: {},
        expectedRegisters: {},
        startingMemory: [],
        expectedMemory: []
    }
}

describe('the captured <sim.h> compiles', () => {
    it('cover every Target, compiler and optimization the editor offers', () => {
        const services = fixtures.filter((fixture) => fixture.program === 'services')
        expect(services).toHaveLength(12)
        expect(
            new Set(services.map((f) => `${f.target} ${f.compiler} ${f.optimization}`)).size
        ).toBe(12)
    })

    it.each(fixtures.map((fixture) => [fixture.name, fixture] as const))(
        '%s was asked for as the editor asks',
        async (_, fixture) => {
            const sysroot = {
                ...(await loadRuntimeHeaders(CURRENT_RUNTIME_ABI)),
                'sim.h': header(fixture.target)
            }
            const prepared = createCompilerRequest(requestFor(fixture), sysroot)
            expect(prepared.compilerId).toBe(fixture.compilerId)
            expect(prepared.body.options.userArguments).toBe(fixture.userArguments)
            //and what compileSource sends is that request, `<sim.h>` included
            const { fetcher, result } = compile(fixture)
            await result.catch(() => undefined)
            const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
            const body = JSON.parse(String(init.body))
            expect(body.options.userArguments).toBe(fixture.userArguments)
            expect(
                body.files.find(
                    (file: { filename: string }) => file.filename === 'sysroot/include/sim.h'
                )?.contents
            ).toBe(header(fixture.target))
        }
    )
})

describe('a program calling every service', () => {
    const services = fixtures.filter((fixture) => fixture.program === 'services')

    it.each(services.map((fixture) => [fixture.name, fixture] as const))(
        '%s maps into @runtime/include/sim.h, records only the source, and runs',
        async (_, fixture) => {
            const { emulator, sources, compiled } = await built(fixture)
            try {
                const lineCount = header(fixture.target).split('\n').length
                const mapped = compiled.map.lines.filter(
                    (location) => location?.path === ENVIRONMENT_HEADER_PATH
                )
                expect(mapped.length).toBeGreaterThan(0)
                for (const location of mapped) expect(location!.line).toBeLessThan(lineCount)
                //every system call comes from the header's `__asm__`, whatever the inlining
                const call = fixture.target === 'MIPS' ? /^\s*syscall\b/ : /^\s*ecall\b/
                const assembly = compiled.assembly.split('\n')
                const calls = assembly.flatMap((line, index) => (call.test(line) ? [index] : []))
                expect(calls.length).toBeGreaterThan(20)
                for (const index of calls)
                    expect(compiled.map.lines[index]?.path).toBe(ENVIRONMENT_HEADER_PATH)
                //the header is the editor's: no input, no fingerprint, and the record stays valid
                expect(Object.keys(compiled.record.inputs)).toEqual([fixture.sourcePath])
                expect(cleanCompilationRecords([compiled.record])).toHaveLength(1)
                expect(compiled.assembly).not.toMatch(/^\s*#/m)

                const testcase = servicesTestcase(fixture.target)
                const [outcome] = await emulator.test(sources, [testcase], 2_000_000)
                expect(emulator.errors).toEqual([])
                expect(outcome?.errors ?? []).toEqual([])
                expect(outcome?.passed).toBe(true)
                //exit2 ended the program with the code it was given
                const a0 = emulator.registers.find(
                    (register) => register.name === (fixture.target === 'MIPS' ? '$a0' : 'a0')
                )
                expect(Number(a0?.value)).toBe(3)
            } finally {
                emulator.dispose()
            }
        },
        30_000
    )
})

describe('SIM_SCREEN', () => {
    const screens = fixtures.filter(
        (fixture) => fixture.program === 'screen' || fixture.program === 'screen-large'
    )

    it.each(screens.map((fixture) => [fixture.name, fixture] as const))(
        '%s keeps its @screen line, configures the display at Build and draws',
        async (_, fixture) => {
            const { emulator, sources, compiled } = await built(fixture)
            const large = fixture.program === 'screen-large'
            const [width, height, unit] = large ? [512, 256, 1] : [256, 128, 2]
            try {
                const directives = compiled.assembly
                    .split('\n')
                    .filter((line) => line.includes('@screen'))
                expect(directives.map((line) => line.trim())).toEqual([
                    `# @screen width=${width} height=${height} unit=${unit} base=screen`
                ])
                expect(compiled.assembly).not.toContain('#APP')
                await emulator.compile(128, sources)
                expect(emulator.compilerErrors).toEqual([])
                expect(emulator.compilerDiagnostics).toEqual([])
                const display = emulator.getDisplay?.()
                expect(display?.origin).toBe('directive')
                expect(display?.baseLabel).toBe('screen')
                expect(display?.display).toMatchObject({
                    unitWidth: unit,
                    unitHeight: unit,
                    width,
                    height
                })
                //the grid is the array, wherever the compiler put it: in static data, word aligned
                const base = display!.display.baseAddress
                expect(base % 4).toBe(0)
                expect(base).toBeGreaterThanOrEqual(0x10010000)
                expect(base).toBeLessThan(0x10040000)
                await emulator.run(100_000)
                expect(emulator.errors).toEqual([])
                expect(emulator.terminated).toBe(true)
                const screen = emulator.peripherals.screen
                expect([screen.width, screen.height]).toEqual([width / unit, height / unit])
                const pixel = (x: number, y: number) => {
                    const offset = (y * screen.width + x) * 4
                    const pixels = screen.visiblePixels
                    return (pixels[offset] << 16) | (pixels[offset + 1] << 8) | pixels[offset + 2]
                }
                expect(pixel(7, 5)).toBe(0xff8000)
                expect(pixel(8, 5)).toBe(0)
            } finally {
                emulator.dispose()
            }
        },
        30_000
    )

    it.each(
        fixtures
            .filter((fixture) => fixture.program === 'screen-too-large')
            .map((fixture) => [fixture.name, fixture] as const)
    )('%s fails to compile on the static-data assertion', async (_, fixture) => {
        const error = await compile(fixture).result.catch((caught: unknown) => caught)
        expect(error).toBeInstanceOf(SourceCompilationError)
        const diagnostics = (error as SourceCompilationError).diagnostics
        const failure = diagnostics.find((item) => item.severity === 'error')
        //on the line that wrote SIM_SCREEN, saying why
        expect(failure?.file).toBe(fixture.sourcePath)
        expect(failure?.lineIndex).toBe(2)
        expect(failure?.line.line).toBe('SIM_SCREEN(screen, 1024, 1024, 1);')
        expect(failure?.message).toContain('4128768 bytes of static data')
        expect(failure?.message).toContain('other global variables and constants share')
        if (fixture.compiler === 'clang')
            expect(failure?.related?.map((note) => note.file)).toContain(ENVIRONMENT_HEADER_PATH)
    })
})

describe('a diagnostic located in <sim.h>', () => {
    it.each(
        fixtures
            .filter((fixture) => fixture.program === 'header-diagnostic')
            .map((fixture) => [fixture.name, fixture] as const)
    )('%s lands on @runtime/include/sim.h, with its line', async (_, fixture) => {
        const error = await compile(fixture).result.catch((caught: unknown) => caught)
        expect(error).toBeInstanceOf(SourceCompilationError)
        const diagnostics = (error as SourceCompilationError).diagnostics
        //the program's own sim_print_int came first, so the header's is the redefinition
        expect(diagnostics).toHaveLength(1)
        const [redefinition] = diagnostics
        expect(redefinition.severity).toBe('error')
        expect(redefinition.file).toBe(ENVIRONMENT_HEADER_PATH)
        expect(redefinition.message).toBe("redefinition of 'sim_print_int'")
        const lines = header(fixture.target).split('\n')
        expect(redefinition.line.line).toBe(lines[redefinition.lineIndex])
        expect(redefinition.line.line).toBe('static inline void sim_print_int(int value) {')
        //and the note names the program's definition, on its own File
        expect(redefinition.related).toEqual([
            expect.objectContaining({ file: fixture.sourcePath, lineIndex: 0, column: 13 })
        ])
    })
})
