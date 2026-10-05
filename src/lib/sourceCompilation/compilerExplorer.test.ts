import { describe, expect, it, vi } from 'vitest'
import { MIPSEmulator } from '$lib/languages/MIPS/MIPSEmulator.svelte'
import { RISCVEmulator } from '$lib/languages/RISC-V/RISC-VEmulator.svelte'
import {
    compileSource,
    createCompilerRequest,
    SourceCompilationError,
    type CompilationRequest
} from './compilerExplorer'
import {
    fileFingerprint,
    generatedAssemblyPath,
    type CompilationTarget,
    type Optimization
} from './records'
import type { ProjectFiles } from '$lib/projectFiles'

type Fixture = {
    target: CompilationTarget
    optimization: Optimization
    sourcePath: string
    source: string
    headers: Record<string, string>
    expected?: number
    response: {
        code: number
        asm: { text: string; source?: { file: string; line: number } | null }[]
    }
}
// Captured from the public API as hosted programs by scripts/runtime/capture-compile-fixtures.mjs;
// tests never require network access.
const fixtures = Object.values(
    import.meta.glob<Fixture>('./fixtures/*.json', { eager: true, import: 'default' })
)

function requestFor(fixture: Fixture): CompilationRequest {
    const files: ProjectFiles = Object.fromEntries([
        [fixture.sourcePath, { encoding: 'plain', content: fixture.source }],
        ...Object.entries(fixture.headers).map(([path, content]) => [
            path,
            { encoding: 'plain', content }
        ])
    ])
    return {
        sourcePath: fixture.sourcePath,
        outputPath: generatedAssemblyPath(fixture.sourcePath, fixture.target),
        files,
        target: fixture.target,
        optimization: fixture.optimization,
        compiler: 'gcc'
    }
}

describe('real Compiler Explorer output', () => {
    for (const fixture of fixtures) {
        it(`${fixture.target} ${fixture.sourcePath} -O${fixture.optimization}: compiles, maps, runs and undoes`, async () => {
            const request = requestFor(fixture)
            const result = await compileSource(
                request,
                undefined,
                vi.fn(async () => new Response(JSON.stringify(fixture.response)))
            )
            expect(result.map.lines.length).toBe(result.assembly.split('\n').length)
            expect(result.map.lines.slice(0, 6).every((location) => location === null)).toBe(true)
            expect(result.map.lines.some((location) => location?.path === fixture.sourcePath)).toBe(
                true
            )
            for (const header of Object.keys(fixture.headers)) {
                expect(result.map.lines.some((location) => location?.path === header)).toBe(true)
                expect(result.record.inputs[header]).toBe(fileFingerprint(request.files[header]))
            }
            expect(result.assembly).not.toContain('.debug_info')
            const sources = {
                ...(result.record.assemblerProfile
                    ? { assemblerProfile: result.record.assemblerProfile }
                    : {}),
                //a hosted program links the Runtime library and starts at its _start
                ...(result.record.runtimeAbi
                    ? { runtimeAbi: result.record.runtimeAbi, entrySymbol: '_start' }
                    : {}),
                entry: request.outputPath,
                files: {
                    ...request.files,
                    [request.outputPath]: { encoding: 'plain' as const, content: result.assembly }
                }
            }
            const emulator =
                fixture.target === 'MIPS'
                    ? MIPSEmulator(sources)
                    : RISCVEmulator(sources, { language: fixture.target })
            try {
                await emulator.check()
                await emulator.compile(128, sources)
                expect(emulator.compilerErrors).toEqual([])
                //the Build ran the library's _start up to main, the output's own first line
                expect(emulator.currentFile).toBe(request.outputPath)
                expect(result.map.lines[emulator.line]?.path).toBe(fixture.sourcePath)
                expect(emulator.canUndo).toBe(false)
                await emulator.run(100_000)
                expect(emulator.errors).toEqual([])
                expect(emulator.terminated).toBe(true)
                const resultRegister = emulator.registers.find(
                    (register) => register.name === (fixture.target === 'MIPS' ? '$a0' : 'a0')
                )
                expect(Number(resultRegister?.value)).toBe(fixture.expected ?? 20)
                await emulator.undo(1)
                expect(emulator.canUndo).toBe(true)
                await emulator.step()
                expect(emulator.terminated).toBe(true)
            } finally {
                emulator.dispose()
            }
        }, 20_000)
    }
})

describe('Compiler Explorer failures', () => {
    const request = () => requestFor(fixtures[0])
    it('reports source diagnostics with original paths and leaves errors for the caller', async () => {
        const response = {
            code: 1,
            stderr: [
                {
                    text: 'src/main.c:4: error: missing operand',
                    tag: { file: 'src/main.c', line: 4, column: 7 }
                }
            ]
        }
        await expect(
            compileSource(request(), undefined, async () => new Response(JSON.stringify(response)))
        ).rejects.toMatchObject({
            diagnostics: [
                expect.objectContaining({
                    file: 'src/main.c',
                    lineIndex: 3,
                    column: 7,
                    severity: 'error'
                })
            ]
        })
    })
    it('rejects missing main rather than injecting a call to an absent function', async () => {
        await expect(
            compileSource(
                request(),
                undefined,
                async () =>
                    new Response(
                        JSON.stringify({ code: 0, asm: [{ text: 'helper:' }, { text: 'ret' }] })
                    )
            )
        ).rejects.toThrow('must define int main')
    })
    it('handles service errors, malformed responses and truncated output', async () => {
        await expect(
            compileSource(request(), undefined, async () => new Response('', { status: 429 }))
        ).rejects.toThrow('HTTP 429')
        await expect(
            compileSource(request(), undefined, async () => new Response('<html>failure</html>'))
        ).rejects.toThrow('invalid response')
        await expect(
            compileSource(
                request(),
                undefined,
                async () => new Response(JSON.stringify({ code: 0, truncated: true, asm: [] }))
            )
        ).rejects.toThrow('truncated')
    })
    it('limits submitted text and enforces the main signature without shifting source line numbers', () => {
        const current = request()
        const body = createCompilerRequest(current).body
        expect(body.source.startsWith(`#line 1 "${current.sourcePath}"\n`)).toBe(true)
        expect(body.options.userArguments).toContain('-iquote')
        expect(() =>
            createCompilerRequest({
                ...current,
                files: {
                    ...current.files,
                    [current.sourcePath]: { encoding: 'plain', content: 'a'.repeat(1024 * 1024) }
                }
            })
        ).toThrow(SourceCompilationError)
    })
    it('rejects malformed nested locations and keeps successful informational output nonblocking', async () => {
        await expect(
            compileSource(
                request(),
                undefined,
                async () =>
                    new Response(
                        JSON.stringify({
                            code: 0,
                            asm: [{ text: 'main:', source: { file: 7, line: 1 } }]
                        })
                    )
            )
        ).rejects.toThrow('invalid assembly')
        const result = await compileSource(
            request(),
            undefined,
            async () =>
                new Response(
                    JSON.stringify({
                        ...fixtures[0].response,
                        stdout: [{ text: 'Compilation complete', tag: { file: 7 } }]
                    })
                )
        )
        expect(result.diagnostics).toEqual([
            expect.objectContaining({ severity: 'suggestion', file: request().sourcePath })
        ])
    })
})

describe('hosted compilation', () => {
    const hosted = (): CompilationRequest => ({
        sourcePath: 'src/main.c',
        outputPath: 'src/main.c.riscv',
        files: { 'src/main.c': { encoding: 'plain', content: 'int main(void) { return 0; }\n' } },
        target: 'RISC-V',
        optimization: '0'
    })

    it('compiles against the Runtime library headers, without renaming main', () => {
        const request = createCompilerRequest(hosted(), { 'stdio.h': 'int puts(const char *);' })
        expect(request.body.source.startsWith('#line 1 "src/main.c"\n')).toBe(true)
        expect(request.body.source).not.toContain('__asm_editor_main')
        expect(request.body.options.userArguments).toContain('-nostdinc -isystem sysroot/include')
        expect(request.body.options.userArguments).not.toContain('-Dmain')
        expect(request.body.options.userArguments).not.toContain('-ffreestanding')
        expect(request.body.files).toContainEqual({
            filename: 'sysroot/include/stdio.h',
            contents: 'int puts(const char *);'
        })
        const cpp = createCompilerRequest(
            {
                ...hosted(),
                sourcePath: 'src/main.cpp',
                files: { 'src/main.cpp': { encoding: 'plain', content: 'int main() {}\n' } }
            },
            {}
        )
        expect(cpp.body.options.userArguments).toContain('-fno-threadsafe-statics -nostdinc++')
    })

    it('keeps sections for the GNU profile, adds no startup code and records the Runtime ABI', async () => {
        const response = {
            code: 0,
            asm: [
                { text: '.text' },
                { text: '.globl main' },
                { text: 'main:', source: { file: null, line: 1, mainsource: true } },
                { text: 'li a0,0' },
                { text: 'ret' },
                { text: '.section .init_array,"aw"' },
                { text: '.word main' },
                { text: '.section .debug_info,"",@progbits' },
                { text: '.word 1' }
            ]
        }
        const result = await compileSource(
            hosted(),
            undefined,
            async () => new Response(JSON.stringify(response))
        )
        expect(result.assembly).toBe(
            '.text\n.globl main\nmain:\nli a0,0\nret\n.section .init_array,"aw"\n.word main\n'
        )
        expect(result.map.lines[2]).toEqual({ path: 'src/main.c', line: 0 })
        expect(result.record).toEqual(
            expect.objectContaining({ runtimeAbi: 'v1', assemblerProfile: 'gnu-compiler-v1' })
        )
        await expect(
            compileSource(
                hosted(),
                undefined,
                async () => new Response(JSON.stringify({ code: 0, asm: [{ text: 'helper:' }] }))
            )
        ).rejects.toThrow('int main(void) or int main(int argc')
    })

    it('drops MIPS debug sections, their .previous and their labels, and keeps the rest', async () => {
        const response = {
            code: 0,
            asm: [
                { text: '\t.section .mdebug.abi32' },
                { text: '\t.previous' },
                { text: '\t.nan\tlegacy' },
                { text: '\t.module\tfp=32' },
                { text: '\t.text' },
                { text: '$Ltext0:' },
                { text: '\t.globl\tmain' },
                { text: 'main:', source: { file: null, line: 1, mainsource: true } },
                { text: '$LFB0 = .' },
                { text: '\tslt\t$2,$4,5' },
                { text: '\tjr\t$31' },
                { text: '\tnop' },
                { text: '$LFE0:' },
                { text: '\t.section\t.debug_info,"",@progbits' },
                { text: '$Ldebug_info0:' }
            ]
        }
        const result = await compileSource(
            { ...hosted(), outputPath: 'src/main.c.mips', target: 'MIPS' },
            undefined,
            async () => new Response(JSON.stringify(response))
        )
        expect(result.assembly).toBe(
            '\t.nan\tlegacy\n\t.module\tfp=32\n\t.text\n\t.globl\tmain\nmain:\n\tslt\t$2,$4,5\n\tjr\t$31\n\tnop\n'
        )
        expect(result.record).toEqual(
            expect.objectContaining({ runtimeAbi: 'v1', assemblerProfile: 'gnu-compiler-v1' })
        )
    })
})
