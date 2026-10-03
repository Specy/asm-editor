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
    response: {
        code: number
        asm: { text: string; source?: { file: string; line: number } | null }[]
    }
}
// Captured from the public API on 2026-10-03; tests never require network access.
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
        optimization: fixture.optimization
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
            expect(result.map.lines.some((location) => location?.path === 'src/values.h')).toBe(
                true
            )
            expect(result.record.inputs['src/values.h']).toBe(
                fileFingerprint(request.files['src/values.h'])
            )
            expect(result.assembly).not.toContain('.debug_info')
            const sources = {
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
                for (let steps = 0; steps < 16 && !result.map.lines[emulator.line]; steps++)
                    await emulator.step()
                expect(result.map.lines[emulator.line]?.path).toBe(fixture.sourcePath)
                await emulator.run(100_000)
                expect(emulator.errors).toEqual([])
                expect(emulator.terminated).toBe(true)
                const resultRegister = emulator.registers.find(
                    (register) => register.name === (fixture.target === 'MIPS' ? '$a0' : 'a0')
                )
                expect(Number(resultRegister?.value)).toBe(20)
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
        expect(body.source).toContain(`#line 1 "${current.sourcePath}"`)
        expect(body.source).toContain('int __asm_editor_main(void);')
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
                            asm: [{ text: '__asm_editor_main:', source: { file: 7, line: 1 } }]
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
