import { describe, expect, it, vi } from 'vitest'
import { GCC_INTEL_V1 } from '@specy/x86/compiler-output'
import { MIPSEmulator } from '$lib/languages/MIPS/MIPSEmulator.svelte'
import { RISCVEmulator } from '$lib/languages/RISC-V/RISC-VEmulator.svelte'
import { X86Emulator } from '$lib/languages/X86/X86Emulator.svelte'
import { loadRuntimeHeaders } from '$lib/sourceRuntime/runtimeLibrary'
import {
    compilerPreset,
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
// Captured from the public API as hosted programs by scripts/runtime/capture-compile-fixtures.mjs,
// x86's as freestanding ones; tests never require network access.
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
            const assembly = result.assembly.split('\n')
            if (fixture.target === 'X86') {
                //NASM translated from GCC's output, whose header and labels come from no source line
                expect(assembly[0]).toBe('    default rel')
                expect(result.map.lines[0]).toBeNull()
                expect(result.map.lines[assembly.indexOf('main:')]).toBeNull()
                expect(result.record).not.toHaveProperty('assemblerProfile')
                expect(result.record).not.toHaveProperty('runtimeAbi')
            } else {
                expect(result.map.lines.slice(0, 6).every((location) => location === null)).toBe(
                    true
                )
            }
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
                //an x86 program starts at the start unit its Build links instead of a library
                ...(fixture.target === 'X86' ? { entrySymbol: '_start' } : {}),
                entry: request.outputPath,
                files: {
                    ...request.files,
                    [request.outputPath]: { encoding: 'plain' as const, content: result.assembly }
                }
            }
            const emulator =
                fixture.target === 'MIPS'
                    ? MIPSEmulator(sources)
                    : fixture.target === 'X86'
                      ? await X86Emulator(sources, { automaticChecking: false })
                      : RISCVEmulator(sources, { language: fixture.target })
            try {
                await emulator.check()
                await emulator.compile(128, sources)
                expect(emulator.compilerErrors).toEqual([])
                if (fixture.target !== 'X86') {
                    //the Build ran the library's _start up to main, the output's own first line
                    expect(emulator.currentFile).toBe(request.outputPath)
                    expect(result.map.lines[emulator.line]?.path).toBe(fixture.sourcePath)
                } else {
                    //the Build ran the start code up to main's first instruction, which may come
                    //from a header's inlined function
                    expect(emulator.currentFile).toBe(request.outputPath)
                    expect(emulator.line).toBe(assembly.indexOf('main:') + 1)
                    expect(result.map.lines[emulator.line]).not.toBeNull()
                }
                expect(emulator.canUndo).toBe(false)
                await emulator.run(100_000)
                expect(emulator.errors).toEqual([])
                expect(emulator.terminated).toBe(true)
                //x86 exits through exit_group, which leaves main's result in rdi
                const resultRegister = emulator.registers.find(
                    (register) =>
                        register.name ===
                        (fixture.target === 'MIPS'
                            ? '$a0'
                            : fixture.target === 'X86'
                              ? 'rdi'
                              : 'a0')
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

describe('x86 compilation', () => {
    const x86 = (
        content = 'int main(void) { return 0; }\n',
        sourcePath = 'src/main.c'
    ): CompilationRequest => ({
        sourcePath,
        outputPath: generatedAssemblyPath(sourcePath, 'X86'),
        files: {
            [sourcePath]: { encoding: 'plain', content },
            'src/values.h': { encoding: 'plain', content: 'static inline int twice(int v);\n' }
        },
        target: 'X86',
        optimization: '2'
    })
    //GCC's lines around a unit's own, which leave the translation nothing to warn about
    const output = (...lines: string[]) => ({
        code: 0,
        asm: [
            '\t.file\t"example.c"',
            '\t.intel_syntax noprefix',
            '\t.text',
            ...lines,
            '\t.ident\t"GCC: (Compiler-Explorer-Build-gcc--binutils-2.42) 14.2.0"',
            '\t.section\t.note.GNU-stack,"",@progbits'
        ].map((text) => ({ text }))
    })
    const respond = (body: unknown) => async () => new Response(JSON.stringify(body))
    const failure = (request: CompilationRequest, body: unknown) =>
        compileSource(request, undefined, respond(body)).then(
            () => expect.unreachable('the compilation succeeded'),
            (error: SourceCompilationError) => error
        )
    const FREESTANDING = [
        'stddef.h',
        'stdint.h',
        'stdbool.h',
        'stdarg.h',
        'limits.h',
        'float.h',
        'iso646.h',
        'stdnoreturn.h',
        'cstddef',
        'cstdint',
        'climits',
        'cfloat',
        'cstdarg',
        'new'
    ]

    it("asks GCC 14.2 for its translation profile's output, with only the freestanding headers", async () => {
        const headers = await loadRuntimeHeaders('v1')
        const c = createCompilerRequest(x86(), headers, GCC_INTEL_V1)
        expect(c.compilerId).toBe('cg142')
        expect(c.body.source).toBe('#line 1 "src/main.c"\nint main(void) { return 0; }\n')
        expect(c.body.options.userArguments).toBe(
            "-O2 -fdiagnostics-color=never -fno-section-anchors -ffreestanding -masm=intel -fno-pie -fno-stack-protector -fcf-protection=none -fno-verbose-asm -g1 -nostdinc -isystem sysroot/include -march=x86-64 -mtune=generic -iquote 'src' -I . -std=c17"
        )
        //the translation reads GCC's raw output, its .file and .loc directives included
        expect(Object.values(c.body.options.filters).every((filter) => filter === false)).toBe(true)
        expect(c.body.files.map((file) => file.filename).sort()).toEqual(
            ['src/values.h', ...FREESTANDING.map((name) => `sysroot/include/${name}`)].sort()
        )
        expect(c.body.files).toContainEqual({
            filename: 'sysroot/include/stdint.h',
            contents: headers['stdint.h']
        })
        const cpp = createCompilerRequest(
            x86('int main() {}\n', 'src/main.cpp'),
            headers,
            GCC_INTEL_V1
        )
        expect(cpp.compilerId).toBe('g142')
        expect(cpp.body.options.userArguments).toBe(
            "-O2 -fdiagnostics-color=never -fno-section-anchors -ffreestanding -masm=intel -fno-pie -fno-stack-protector -fcf-protection=none -fno-verbose-asm -g1 -nostdinc -isystem sysroot/include -march=x86-64 -mtune=generic -iquote 'src' -I . -std=c++17 -fno-exceptions -fno-rtti -fno-threadsafe-statics -nostdinc++"
        )
    })

    it('compiles with GCC whatever compiler is asked for', () => {
        const request = createCompilerRequest(
            { ...x86(), compiler: 'clang', sourceAnnotations: true },
            {},
            GCC_INTEL_V1
        )
        expect(request.compilerId).toBe('cg142')
        expect(request.body.options.userArguments).toContain('-fno-verbose-asm')
        expect(request.body.options.userArguments).not.toContain('-fverbose-asm')
        expect(compilerPreset('X86', 'cpp', 'clang', GCC_INTEL_V1).id).toBe('g142')
    })

    it('needs the translation profile, which only an x86 compilation loads', () => {
        expect(() => createCompilerRequest(x86())).toThrow('translation profile')
        expect(() => compilerPreset('X86', 'c')).toThrow('translation profile')
        expect(createCompilerRequest({ ...x86(), target: 'RISC-V' }).compilerId).toBe(
            'rv32-cclang2110'
        )
    })

    it("translates GCC's output to NASM, mapped through the compiler's own locations", async () => {
        const fixture = fixtures.find(
            (item) =>
                item.target === 'X86' &&
                item.sourcePath === 'src/main.c' &&
                item.optimization === '0'
        )!
        const request = requestFor(fixture)
        const result = await compileSource(request, undefined, respond(fixture.response))
        const lines = result.assembly.split('\n')
        expect(lines.slice(0, 3)).toEqual(['    default rel', '    section .text', 'twice:'])
        expect(result.assembly).not.toMatch(/\.(?:file|loc|intel_syntax|cfi_\w+)\b|PTR/)
        //twice comes from the header and main from the source, each at its own line
        expect(result.map.lines[lines.indexOf('twice:') + 1]).toEqual({
            path: 'src/values.h',
            line: 0
        })
        expect(lines[lines.indexOf('main:') + 1]).toBe('    push rbp')
        expect(result.map.lines[lines.indexOf('main:') + 1]).toEqual({
            path: 'src/main.c',
            line: 3
        })
        expect(result.map.lines[result.map.lines.length - 1]).toBeNull()
        expect(result.record).toEqual({
            sourcePath: 'src/main.c',
            outputPath: 'src/main.c.asm',
            target: 'X86',
            language: 'c',
            compilerId: 'cg142',
            optimization: '0',
            inputs: {
                'src/main.c': fileFingerprint(request.files['src/main.c']),
                'src/values.h': fileFingerprint(request.files['src/values.h'])
            },
            outputFingerprint: fileFingerprint({ encoding: 'plain', content: result.assembly })
        })
        expect(result.diagnostics).toEqual([])
    })

    it('requires main among the global definitions rather than any label of that name', async () => {
        const result = await compileSource(
            x86(),
            undefined,
            respond(output('\t.globl\tmain', 'main:', '\txor\teax, eax', '\tret'))
        )
        expect(result.assembly).toBe(
            '    default rel\n    section .text\n    global main\nmain:\n    xor eax, eax\n    ret\n'
        )
        for (const unit of [output('helper:', '\tret'), output('main:', '\tret')]) {
            const error = await failure(x86(), unit)
            expect(error.message).toBe(
                'The program must define int main(void) or int main(int argc, char **argv).'
            )
        }
    })

    it('rejects inline assembly on the line of its asm statement', async () => {
        const source =
            'int main(void) {\n    int x = 1;\n    __asm__ volatile ("nop");\n    return x;\n}\n'
        //GCC's output for it at -O0, as Compiler Explorer returned it
        const response = output(
            '\t.globl\tmain',
            '\t.type\tmain, @function',
            'main:',
            '\t.file 1 "src/main.c"',
            '\t.loc 1 1 16',
            '\tpush\trbp',
            '\tmov\trbp, rsp',
            '\t.loc 1 2 9',
            '\tmov\tDWORD PTR [rbp-4], 1',
            '\t.loc 1 3 5',
            '#APP',
            '# 3 "src/main.c" 1',
            '\tnop',
            '# 0 "" 2',
            '\t.loc 1 4 12',
            '#NO_APP',
            '\tmov\teax, DWORD PTR [rbp-4]',
            '\t.loc 1 5 1',
            '\tpop\trbp',
            '\tret'
        )
        const error = await failure(x86(source), response)
        expect(error.message).toBe('The compiler output uses something x86 cannot run yet.')
        expect(error.diagnostics).toEqual([
            expect.objectContaining({
                severity: 'error',
                file: 'src/main.c',
                lineIndex: 2,
                column: 5,
                code: 'inline-assembly',
                source: 'Compiler Explorer',
                message: 'Inline assembly cannot be compiled for x86 yet.',
                hint: expect.stringContaining('in a .asm File of the Project'),
                line: { line: '    __asm__ volatile ("nop");', line_index: 2 }
            })
        ])
    })

    it('puts what does not translate on its source line, or else the first, and keeps warnings', async () => {
        const source = '__thread int counter;\nint main(void) {\n    return counter;\n}\n'
        //thread-local storage, at -O0
        const response = output(
            '\t.globl\tcounter',
            '\t.section\t.tbss,"awT",@nobits',
            '\t.align 4',
            '\t.type\tcounter, @object',
            '\t.size\tcounter, 4',
            'counter:',
            '\t.zero\t4',
            '\t.text',
            '\t.globl\tmain',
            '\t.type\tmain, @function',
            'main:',
            '\t.file 1 "src/main.c"',
            '\t.loc 1 2 16',
            '\tpush\trbp',
            '\tmov\trbp, rsp',
            '\t.loc 1 3 12',
            '\tmov\teax, DWORD PTR fs:counter@tpoff',
            '\t.loc 1 4 1',
            '\tpop\trbp',
            '\tret'
        )
        const error = await failure(x86(source), response)
        expect(
            error.diagnostics.map(({ file, lineIndex, column, severity, code }) => ({
                file,
                lineIndex,
                column,
                severity,
                code
            }))
        ).toEqual([
            {
                file: 'src/main.c',
                lineIndex: 0,
                column: 1,
                severity: 'error',
                code: 'unsupported-section'
            },
            {
                file: 'src/main.c',
                lineIndex: 2,
                column: 12,
                severity: 'error',
                code: 'unsupported-operand'
            }
        ])
        //output no .ident vouches for still builds, with a warning
        const unverified = output('\t.globl\tmain', 'main:', '\txor\teax, eax', '\tret')
        const result = await compileSource(
            x86(),
            undefined,
            respond({
                ...unverified,
                asm: unverified.asm.filter(({ text }) => !text.includes('.ident'))
            })
        )
        expect(result.diagnostics).toEqual([
            expect.objectContaining({
                severity: 'warning',
                file: 'src/main.c',
                lineIndex: 0,
                code: 'unverified-compiler'
            })
        ])
    })

    it('explains a standard header x86 programs cannot include yet', async () => {
        const missing = (header: string, sourcePath = 'src/main.c') => ({
            code: 1,
            stderr: [
                { text: `${sourcePath}:1:10: fatal error: ${header}: No such file or directory` },
                { text: 'compilation terminated.' }
            ]
        })
        const [c] = (await failure(x86('#include <stdio.h>\n'), missing('stdio.h'))).diagnostics
        expect(c).toMatchObject({
            severity: 'error',
            file: 'src/main.c',
            lineIndex: 0,
            column: 10,
            message: 'stdio.h: No such file or directory',
            hint: 'x86 programs have no C standard library yet, so they can include only stddef.h, stdint.h, stdbool.h, stdarg.h, limits.h, float.h, iso646.h and stdnoreturn.h.'
        })
        expect(c.formatted).toBe(`${c.message}\n${c.hint}`)
        const cpp = x86('#include <cstdio>\n', 'src/main.cpp')
        const [header] = (await failure(cpp, missing('cstdio', 'src/main.cpp'))).diagnostics
        expect(header.hint).toBe(
            'x86 programs have no C standard library yet, so they can include only cstddef, cstdint, climits, cfloat, cstdarg, new, stddef.h, stdint.h, stdbool.h, stdarg.h, limits.h, float.h, iso646.h and stdnoreturn.h.'
        )
        //a header no Runtime library has is an ordinary error, as on every Target
        const [vector] = (await failure(cpp, missing('vector', 'src/main.cpp'))).diagnostics
        expect(vector.hint).toBeUndefined()
        const riscv = { ...x86(), target: 'RISC-V' as const, outputPath: 'src/main.c.riscv' }
        const [hosted] = (await failure(riscv, missing('stdio.h'))).diagnostics
        expect(hosted.hint).toBeUndefined()
    })
})
