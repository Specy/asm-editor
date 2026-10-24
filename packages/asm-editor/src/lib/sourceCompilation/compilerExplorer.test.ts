import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it, vi } from 'vite-plus/test'
import { GCC_INTEL_V1, translateCompilerOutput } from '@specy/x86/compiler-output'
import { MIPSEmulator } from '#lib/languages/MIPS/MIPSEmulator.svelte.ts'
import { RISCVEmulator } from '#lib/languages/RISC-V/RISC-VEmulator.svelte.ts'
import { X86Emulator } from '#lib/languages/X86/X86Emulator.svelte.ts'
import { loadRuntimeHeaders } from '#lib/sourceRuntime/runtimeLibrary.ts'
import {
    compilationInputs,
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
import type { ProjectFiles } from '#lib/projectFiles.ts'

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
// Captured from the public API as hosted programs by scripts/capture-compile-fixtures.mjs,
// x86's as freestanding ones; tests never require network access.
const fixtures = Object.values(
    import.meta.glob<Fixture>('./fixtures/*.json', { eager: true, import: 'default' })
)

const HOST_GCC = (() => {
    try {
        execFileSync('gcc', ['--version'], { stdio: 'ignore' })
        return true
    } catch {
        return false
    }
})()

/** A request's include-path flags, unquoted, for a host preprocessor to search the same way. */
function includeFlags(userArguments: string): string[] {
    const words = [...userArguments.matchAll(/'([^']*)'|(\S+)/g)].map(
        (match) => match[1] ?? match[2]
    )
    return words.flatMap((word, index) =>
        word === '-nostdinc'
            ? [word]
            : ['-isystem', '-iquote', '-I', '-include'].includes(word)
              ? [word, words[index + 1]]
              : []
    )
}

function preprocess(request: ReturnType<typeof createCompilerRequest>): string {
    const directory = mkdtempSync(join(tmpdir(), 'asm-editor-include-'))
    try {
        writeFileSync(join(directory, 'example.c'), request.body.source)
        for (const file of request.body.files) {
            mkdirSync(dirname(join(directory, file.filename)), { recursive: true })
            writeFileSync(join(directory, file.filename), file.contents)
        }
        return execFileSync(
            'gcc',
            ['-E', '-P', ...includeFlags(request.body.options.userArguments), 'example.c'],
            { cwd: directory, encoding: 'utf8' }
        )
    } finally {
        rmSync(directory, { recursive: true, force: true })
    }
}

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
            //C++ leaves `main` unmangled, so a .cpp program defines it as a .c one does
            expect(result.definesMain).toBe(true)
            const assembly = result.assembly.split('\n')
            if (fixture.target === 'X86') {
                //NASM translated from GCC's output, whose header and labels come from no source line
                expect(assembly[0]).toBe('    default rel')
                expect(result.map.lines[0]).toBeNull()
                expect(result.map.lines[assembly.indexOf('main:')]).toBeNull()
                expect(result.record).not.toHaveProperty('assemblerProfile')
                expect(result.record.runtimeAbi).toBe('v1')
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
    it('compiles a source without main, rather than injecting a call to an absent function', async () => {
        const result = await compileSource(
            request(),
            undefined,
            async () =>
                new Response(
                    JSON.stringify({ code: 0, asm: [{ text: 'helper:' }, { text: 'ret' }] })
                )
        )
        expect(result.assembly).toBe('helper:\nret\n')
        expect(result.definesMain).toBe(false)
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
    it('limits submitted text without shifting source line numbers', () => {
        const current = request()
        const body = createCompilerRequest(current).body
        expect(body.files).toContainEqual({
            filename: `project/${current.sourcePath}`,
            contents: `#line 1 "${current.sourcePath}"\n${current.files[current.sourcePath].content}`
        })
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
        expect(request.body.files).toContainEqual({
            filename: 'project/src/main.c',
            contents: '#line 1 "src/main.c"\nint main(void) { return 0; }\n'
        })
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

    // A quoted include searches the -iquote directories, an angle-bracket one only the -I and
    // -isystem ones. With the Project root under -iquote, a Project File named stdio.h or sim.h no
    // longer shadows the system header, as it did under -I .
    it('lets quoted includes alone find Project Files', () => {
        for (const sourcePath of ['src/main.c', 'main.c']) {
            const request = createCompilerRequest(
                {
                    ...hosted(),
                    sourcePath,
                    files: { [sourcePath]: { encoding: 'plain', content: 'int main(void) {}\n' } }
                },
                { 'stdio.h': 'int puts(const char *);' }
            )
            const flags = request.body.options.userArguments
            const directory = sourcePath.includes('/') ? "'project/src'" : "'project'"
            expect(flags).toContain('-nostdinc -isystem sysroot/include')
            expect(flags).toContain(`-iquote ${directory} -iquote project `)
            expect(flags.split(' ').filter((flag) => flag.startsWith('-I'))).toEqual([])
        }
    })

    // The include search is the preprocessor's and the same on every target, so the host's GCC
    // checks it on the request as sent, laid out as Compiler Explorer lays it out: the source as
    // example.c at the root, every uploaded file at its name.
    it.skipIf(!HOST_GCC)('finds the system header before a Project File of the same name', () => {
        const text = (content: string) => ({ encoding: 'plain' as const, content })
        const request = createCompilerRequest(
            {
                ...hosted(),
                files: {
                    'src/main.c': text(
                        '#include <stdio.h>\n#include "value.h"\nconst char *which = WHICH;\nint value = VALUE;\n'
                    ),
                    'src/value.h': text('#define VALUE 42\n'),
                    'stdio.h': text('#define WHICH "project"\n')
                }
            },
            { 'stdio.h': '#define WHICH "sysroot"\n' }
        )
        const output = preprocess(request)
        expect(output).toContain('which = "sysroot"')
        expect(output).toContain('value = 42')
    })

    it.skipIf(!HOST_GCC).each(['src/main.c', 'src/main.cpp'])(
        'resolves %s includes beside each including file, then at the Project root',
        (sourcePath) => {
            const text = (content: string) => ({ encoding: 'plain' as const, content })
            const files = {
                [sourcePath]: text(
                    '#include "value.h"\nint source_value = VALUE;\n' +
                        '#include "lib/outer.h"\n#include "fallback.h"\n' +
                        'const char *source_file = __FILE__;\nint source_line = __LINE__;\n' +
                        'int values[] = {VALUE, NESTED, FALLBACK};\n'
                ),
                'value.h': text('#define VALUE 1\n'),
                'src/value.h': text('#define VALUE 2\n'),
                'lib/outer.h': text(
                    '#undef VALUE\n#include "value.h"\n#define NESTED VALUE\n' +
                        'const char *header_file = __FILE__;\n'
                ),
                'lib/value.h': text('#define VALUE 3\n'),
                'fallback.h': text('#define FALLBACK 4\n')
            }
            const request = createCompilerRequest({ ...hosted(), sourcePath, files })
            const output = preprocess(request)
            expect(output).toContain('source_value = 2')
            expect(output).toContain('source_file = "' + sourcePath + '"')
            expect(output).toContain('source_line = 6')
            expect(output).toContain('header_file = "lib/outer.h"')
            expect(output).toContain('values[] = {3, 3, 4}')
            expect(compilationInputs(sourcePath, files)).not.toHaveProperty('value.h')
        }
    )

    it('sends what the quoted includes reach, a .c File included, and nothing else', () => {
        const text = (content: string) => ({ encoding: 'plain' as const, content })
        const request = createCompilerRequest({
            ...hosted(),
            sourcePath: 'c/pacman.c',
            files: {
                'c/pacman.c': text('#include "video.c"\n#if __has_include("debug.h")\n#endif\n'),
                'c/video.c': text('#include "../shared/draw.inc"\nint video;\n'),
                'shared/draw.inc': text('int draw;\n'),
                'c/debug.h': text(''),
                //another Program's source, a header nothing includes and a picture stay home
                'c/other.c': text('int main(void) { return 0; }\n'),
                'unused.h': text('#error not sent\n'),
                'sprites.bmp': { encoding: 'base64', content: 'Qk0=' }
            }
        })
        expect(request.body.files.map((file) => file.filename).sort()).toEqual([
            'project/c/debug.h',
            'project/c/pacman.c',
            'project/c/video.c',
            'project/shared/draw.inc'
        ])
    })

    it.skipIf(!HOST_GCC)('includes a .c File as text, as GCC does', () => {
        const text = (content: string) => ({ encoding: 'plain' as const, content })
        const files = {
            'c/pacman.c': text('#include "parts/video.c"\nint drawn = draw(2);\n'),
            'c/parts/video.c': text('static int draw(int x) { return x * SCALE; }\n'),
            'c/parts/scale.h': text('#define SCALE 3\n'),
            'c/defines.h': text('#define SCALE 7\n')
        }
        //video.c does not include scale.h: SCALE is undefined there, and stays so in the output
        const request = createCompilerRequest({ ...hosted(), sourcePath: 'c/pacman.c', files })
        const output = preprocess(request)
        expect(output).toContain('static int draw(int x) { return x * SCALE; }')
        expect(output).toContain('int drawn = draw(2);')
        expect(Object.keys(compilationInputs('c/pacman.c', files)).sort()).toEqual([
            'c/pacman.c',
            'c/parts/video.c'
        ])
    })

    it.skipIf(!HOST_GCC)(
        'keeps a Project source named example.c separate from the service input',
        () => {
            const request = createCompilerRequest({
                ...hosted(),
                sourcePath: 'example.c',
                files: { 'example.c': { encoding: 'plain', content: 'int answer = 42;\n' } }
            })
            expect(preprocess(request)).toContain('int answer = 42;')
        }
    )

    it('records the Project headers quoted includes reach, and no system header', () => {
        const text = (content: string) => ({ encoding: 'plain' as const, content })
        const files: ProjectFiles = {
            'src/main.c': text(
                '#include <stdio.h>\n#include <sim.h>\n#include "value.h"\n#include "util/shared.h"\nint main(void) {}\n'
            ),
            'src/value.h': text('#define VALUE 1\n'),
            'util/shared.h': text('#include "config.h"\n'),
            'config.h': text('#define CONFIG 1\n'),
            //named like system headers, which an angle-bracket include never reads from the Project
            'stdio.h': text('#error shadowed\n'),
            'sim.h': text('#error shadowed\n')
        }
        expect(Object.keys(compilationInputs('src/main.c', files)).sort()).toEqual([
            'config.h',
            'src/main.c',
            'src/value.h',
            'util/shared.h'
        ])
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
        expect(result.definesMain).toBe(true)
    })

    // A companion File defines what another File includes, and no `main` of its own (programs.md,
    // decision 9): it compiles all the same, and says it defines none.
    it.each(['MIPS', 'RISC-V', 'RISC-V-64'] as const)(
        'compiles a %s companion File that defines no main',
        async (target) => {
            const companion = (...lines: string[]) =>
                compileSource(
                    {
                        sourcePath: 'add.c',
                        outputPath: generatedAssemblyPath('add.c', target),
                        files: {
                            'add.c': {
                                encoding: 'plain',
                                content: 'int add(int a, int b) {\n    return a + b;\n}\n'
                            }
                        },
                        target,
                        optimization: '2',
                        compiler: 'gcc'
                    },
                    undefined,
                    async () =>
                        new Response(
                            JSON.stringify({
                                code: 0,
                                asm: [
                                    '\t.text',
                                    '\t.align\t2',
                                    ...lines,
                                    '\t.ident\t"GCC: (crosstool-NG UNKNOWN) 14.2.0"'
                                ].map((text) => ({ text }))
                            })
                        )
                )
            const [add, ret] =
                target === 'MIPS' ? ['\taddu\t$2,$4,$5', '\tjr\t$31'] : ['\tadd\ta0,a0,a1', '\tret']
            const result = await companion(
                '\t.globl\tadd',
                '\t.type\tadd, @function',
                'add:',
                add,
                ret,
                '\t.size\tadd, .-add'
            )
            expect(result.definesMain).toBe(false)
            expect(result.assembly).toContain(`add:\n${add}\n`)
            expect(result.record).toEqual(
                expect.objectContaining({ sourcePath: 'add.c', target, runtimeAbi: 'v1' })
            )
            //a `main` label is the program's only together with its `.globl`
            expect((await companion('main:', ret)).definesMain).toBe(false)
            expect((await companion('\t.globl\tmain', 'helper:', ret)).definesMain).toBe(false)
            //Clang follows each with a comment
            expect(
                (
                    await companion(
                        '\t.globl\tmain                            # -- Begin function main',
                        'main:                                   # @main',
                        ret
                    )
                ).definesMain
            ).toBe(true)
        }
    )

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

    it('asks Clang at -O0 alone to mark the instructions it gives no source line', () => {
        const flag = '-mllvm -use-unknown-locations=Enable'
        expect(createCompilerRequest(hosted()).body.options.userArguments).toContain(flag)
        expect(
            createCompilerRequest({ ...hosted(), optimization: '2' }).body.options.userArguments
        ).not.toContain(flag)
        expect(
            createCompilerRequest({ ...hosted(), compiler: 'gcc' }).body.options.userArguments
        ).not.toContain(flag)
    })

    // Clang 21.1's output at -O0 for this program, trimmed to main and of its CFI and MIPS frame
    // directives. The constant a statement starts with has no source line: line 0, or the function's
    // opening line before prologue_end.
    const unlocatedSource =
        'int add(int x, int y) {\n    return x + y;\n}\nint main(void) {\n    int a = 6;\n    int b = 7;\n    if (a < b)\n        a = add(a, 100000);\n    return a;\n}\n'
    const unlocatedOutput: Record<'RISC-V-64' | 'MIPS', ([string] | [string, number])[]> = {
        'RISC-V-64': [
            ['main:'],
            ['.Lfunc_begin1:'],
            ['\t.loc\t1 4 0 is_stmt 1'],
            ['\taddi\tsp, sp, -32', 4],
            ['\tsd\tra, 24(sp)', 4],
            ['\tsd\ts0, 16(sp)', 4],
            ['\taddi\ts0, sp, 32', 4],
            ['\tli\ta0, 0', 4],
            ['\tsw\ta0, -20(s0)', 4],
            ['\tli\ta0, 6', 4],
            ['.Ltmp2:'],
            ['\t.loc\t1 5 9 prologue_end'],
            ['\tsw\ta0, -24(s0)', 5],
            ['\t.loc\t1 0 9 is_stmt 0'],
            ['\tli\ta0, 7', 0],
            ['\t.loc\t1 6 9 is_stmt 1'],
            ['\tsw\ta0, -28(s0)', 6],
            ['\t.loc\t1 7 9'],
            ['\tlw\ta0, -24(s0)', 7],
            ['\t.loc\t1 7 13 is_stmt 0'],
            ['\tlw\ta1, -28(s0)', 7],
            ['\t.loc\t1 7 11'],
            ['\tbge\ta0, a1, .LBB1_2', 7],
            ['\tj\t.LBB1_1', 7],
            ['.LBB1_1:'],
            ['\t.loc\t1 8 17 is_stmt 1'],
            ['\tlw\ta0, -24(s0)', 8],
            ['\t.loc\t1 0 17 is_stmt 0'],
            ['\tlui\ta1, 24', 0],
            ['\taddi\ta1, a1, 1696', 0],
            ['\t.loc\t1 8 13'],
            ['\tcall\tadd', 8],
            ['\t.loc\t1 8 11'],
            ['\tsw\ta0, -24(s0)', 8],
            ['\t.loc\t1 8 9'],
            ['\tj\t.LBB1_2', 8],
            ['.LBB1_2:'],
            ['\t.loc\t1 9 12 is_stmt 1'],
            ['\tlw\ta0, -24(s0)', 9],
            ['\t.loc\t1 9 5 epilogue_begin is_stmt 0'],
            ['\tld\tra, 24(sp)', 9],
            ['\tld\ts0, 16(sp)', 9],
            ['\taddi\tsp, sp, 32', 9],
            ['\tret', 9],
            ['.Ltmp3:'],
            ['.Lfunc_end1:']
        ],
        MIPS: [
            ['main:'],
            ['$tmp3:'],
            ['$func_begin1 = $tmp3'],
            ['\t.loc\t1 4 0 is_stmt 1'],
            ['\taddiu\t$sp, $sp, -40', 4],
            ['\tsw\t$ra, 36($sp)', 4],
            ['\tsw\t$fp, 32($sp)', 4],
            ['\tmove\t$fp, $sp', 4],
            ['\tsw\t$zero, 28($fp)', 4],
            ['\taddiu\t$1, $zero, 6', 4],
            ['$tmp4:'],
            ['\t.loc\t1 5 9 prologue_end'],
            ['\tsw\t$1, 24($fp)', 5],
            ['\t.loc\t1 0 9 is_stmt 0'],
            ['\taddiu\t$1, $zero, 7', 0],
            ['\t.loc\t1 6 9 is_stmt 1'],
            ['\tsw\t$1, 20($fp)', 6],
            ['\t.loc\t1 7 9'],
            ['\tlw\t$1, 24($fp)', 7],
            ['\t.loc\t1 7 13 is_stmt 0'],
            ['\tlw\t$2, 20($fp)', 7],
            ['\t.loc\t1 7 11'],
            ['\tslt\t$1, $1, $2', 7],
            ['\tbeqz\t$1, $BB1_3', 7],
            ['\tnop', 7],
            ['\tj\t$BB1_2', 7],
            ['\tnop', 7],
            ['$BB1_2:'],
            ['\t.loc\t1 8 17 is_stmt 1'],
            ['\tlw\t$4, 24($fp)', 8],
            ['\t.loc\t1 0 17 is_stmt 0'],
            ['\tlui\t$1, 1', 0],
            ['\tori\t$5, $1, 34464', 0],
            ['\t.loc\t1 8 13'],
            ['\tjal\tadd', 8],
            ['\tnop', 8],
            ['\t.loc\t1 8 11'],
            ['\tsw\t$2, 24($fp)', 8],
            ['\t.loc\t1 8 9'],
            ['\tj\t$BB1_3', 8],
            ['\tnop', 8],
            ['$BB1_3:'],
            ['\t.loc\t1 9 12 is_stmt 1'],
            ['\tlw\t$2, 24($fp)', 9],
            ['\t.loc\t1 9 5 is_stmt 0'],
            ['\tmove\t$sp, $fp', 9],
            ['\tlw\t$fp, 32($sp)', 9],
            ['\tlw\t$ra, 36($sp)', 9],
            ['\t.loc\t1 0 5'],
            ['\taddiu\t$sp, $sp, 40', 0],
            ['\t.loc\t1 9 5'],
            ['\tjr\t$ra', 9],
            ['\tnop', 9],
            ['$tmp5:'],
            ['$func_end1:']
        ]
    }
    const unlocated = (
        target: 'RISC-V-64' | 'MIPS',
        optimization: Optimization,
        source = unlocatedSource,
        output = unlocatedOutput[target]
    ) =>
        compileSource(
            {
                sourcePath: 'src/main.c',
                outputPath: generatedAssemblyPath('src/main.c', target),
                files: { 'src/main.c': { encoding: 'plain', content: source } },
                target,
                optimization,
                compiler: 'clang'
            },
            undefined,
            async () =>
                new Response(
                    JSON.stringify({
                        code: 0,
                        asm: output.map(([text, line]) => ({
                            text,
                            source:
                                line === undefined ? null : { file: null, line, mainsource: true }
                        }))
                    })
                )
        ).then((result) =>
            //each instruction after the one-based source line it maps to, 0 for none
            result.assembly
                .split('\n')
                .flatMap((text, index) =>
                    /^\t[a-z]/.test(text)
                        ? [`${(result.map.lines[index]?.line ?? -1) + 1} ${text.trim()}`]
                        : []
                )
                .map((line) => line.replace(/\s+/g, ' '))
        )

    it("maps Clang's -O0 constants to the statement they begin", async () => {
        expect(await unlocated('RISC-V-64', '0')).toEqual([
            '4 addi sp, sp, -32',
            '4 sd ra, 24(sp)',
            '4 sd s0, 16(sp)',
            '4 addi s0, sp, 32',
            //the return value's slot, before the first statement
            '4 li a0, 0',
            '4 sw a0, -20(s0)',
            '5 li a0, 6',
            '5 sw a0, -24(s0)',
            '6 li a0, 7',
            '6 sw a0, -28(s0)',
            '7 lw a0, -24(s0)',
            '7 lw a1, -28(s0)',
            '7 bge a0, a1, .LBB1_2',
            '7 j .LBB1_1',
            '8 lw a0, -24(s0)',
            '8 lui a1, 24',
            '8 addi a1, a1, 1696',
            '8 call add',
            '8 sw a0, -24(s0)',
            '8 j .LBB1_2',
            '9 lw a0, -24(s0)',
            '9 ld ra, 24(sp)',
            '9 ld s0, 16(sp)',
            '9 addi sp, sp, 32',
            '9 ret'
        ])
        expect(await unlocated('MIPS', '0')).toEqual([
            '4 addiu $sp, $sp, -40',
            '4 sw $ra, 36($sp)',
            '4 sw $fp, 32($sp)',
            '4 move $fp, $sp',
            '4 sw $zero, 28($fp)',
            '5 addiu $1, $zero, 6',
            '5 sw $1, 24($fp)',
            '6 addiu $1, $zero, 7',
            '6 sw $1, 20($fp)',
            '7 lw $1, 24($fp)',
            '7 lw $2, 20($fp)',
            '7 slt $1, $1, $2',
            '7 beqz $1, $BB1_3',
            '7 nop',
            '7 j $BB1_2',
            '7 nop',
            '8 lw $4, 24($fp)',
            '8 lui $1, 1',
            '8 ori $5, $1, 34464',
            '8 jal add',
            '8 nop',
            '8 sw $2, 24($fp)',
            '8 j $BB1_3',
            '8 nop',
            '9 lw $2, 24($fp)',
            '9 move $sp, $fp',
            '9 lw $fp, 32($sp)',
            '9 lw $ra, 36($sp)',
            '9 addiu $sp, $sp, 40',
            '9 jr $ra',
            '9 nop'
        ])
    })

    // An && for its value spills each branch's result where the blocks meet: the spill and the
    // jump end their block with no line, and the reload starts the next one.
    it('keeps the line before for what ends a block without one', async () => {
        const source =
            'int main(void) {\n    int a = 6;\n    int c = a > 1 && a < 9;\n    return c;\n}\n'
        const output: ([string] | [string, number])[] = [
            ['main:'],
            ['.Lfunc_begin0:'],
            ['\t.loc\t1 1 0'],
            ['\taddi\tsp, sp, -48', 1],
            ['\tsd\tra, 40(sp)', 1],
            ['\tsd\ts0, 32(sp)', 1],
            ['\taddi\ts0, sp, 48', 1],
            ['\tli\ta2, 0', 1],
            ['\tsw\ta2, -20(s0)', 1],
            ['\tli\ta0, 6', 1],
            ['.Ltmp0:'],
            ['\t.loc\t1 2 9 prologue_end'],
            ['\tsw\ta0, -24(s0)', 2],
            ['\t.loc\t1 3 13'],
            ['\tlw\ta0, -24(s0)', 3],
            ['\t.loc\t1 0 13 is_stmt 0'],
            ['\tli\ta1, 2', 0],
            ['\tsd\ta2, -40(s0)', 0],
            ['\t.loc\t1 3 19'],
            ['\tblt\ta0, a1, .LBB0_2', 3],
            ['\tj\t.LBB0_1', 3],
            ['.LBB0_1:'],
            ['\t.loc\t1 3 22'],
            ['\tlw\ta0, -24(s0)', 3],
            ['\t.loc\t1 3 24'],
            ['\tslti\ta0, a0, 9', 3],
            ['\t.loc\t1 0 24'],
            ['\tsd\ta0, -40(s0)', 0],
            ['\tj\t.LBB0_2', 0],
            ['.LBB0_2:'],
            ['\tld\ta0, -40(s0)', 0],
            ['\t.loc\t1 3 19'],
            ['\tandi\ta0, a0, 1', 3],
            ['\t.loc\t1 3 9'],
            ['\tsw\ta0, -28(s0)', 3],
            ['\t.loc\t1 4 12 is_stmt 1'],
            ['\tlw\ta0, -28(s0)', 4],
            ['\t.loc\t1 4 5 epilogue_begin is_stmt 0'],
            ['\tld\tra, 40(sp)', 4],
            ['\tld\ts0, 32(sp)', 4],
            ['\taddi\tsp, sp, 48', 4],
            ['\tret', 4],
            ['.Ltmp1:'],
            ['.Lfunc_end0:']
        ]
        expect((await unlocated('RISC-V-64', '0', source, output)).slice(6)).toEqual([
            '2 li a0, 6',
            '2 sw a0, -24(s0)',
            '3 lw a0, -24(s0)',
            '3 li a1, 2',
            '3 sd a2, -40(s0)',
            '3 blt a0, a1, .LBB0_2',
            '3 j .LBB0_1',
            '3 lw a0, -24(s0)',
            '3 slti a0, a0, 9',
            '3 sd a0, -40(s0)',
            '3 j .LBB0_2',
            '3 ld a0, -40(s0)',
            '3 andi a0, a0, 1',
            '3 sw a0, -28(s0)',
            '4 lw a0, -28(s0)',
            '4 ld ra, 40(sp)',
            '4 ld s0, 32(sp)',
            '4 addi sp, sp, 48',
            '4 ret'
        ])
    })

    // Compiler Explorer ends a location at any line naming `.data` or `.text`, so it gave these lines
    // none: Clang's `next.data` for a static local and `__const.main.text` for a local array's
    // initializer. Its output, trimmed to the functions and `.file` lines concerned.
    it('maps the instructions that name a static local or an initializer called data or text', async () => {
        const source =
            'static int next(void) {\n    static int data = 40;\n    return ++data;\n}\nint main(void) {\n    char text[] = "red;green,blue;;yellow";\n    int sum = next();\n    for (int i = 0; text[i]; i++)\n        sum += text[i] == \';\';\n    return sum;\n}\n'
        const files: ([string] | [string, number])[] = [
            ['\t.file\t0 "/app" "/app/example.c" md5 0x277c0bd14813e203b61932a275037f00'],
            ['\t.file\t1 "example.c" md5 0x277c0bd14813e203b61932a275037f00']
        ]
        const riscv: ([string] | [string, number])[] = [
            ...files,
            ['next:'],
            ['.Lfunc_begin1:'],
            ['\t.loc\t1 1 0 is_stmt 1'],
            ['\taddi\tsp, sp, -16', 1],
            ['\tsd\tra, 8(sp)', 1],
            ['\tsd\ts0, 0(sp)', 1],
            ['\taddi\ts0, sp, 16', 1],
            ['.Ltmp2:'],
            ['\t.loc\t1 3 12 prologue_end'],
            ['\tlui\ta1, %hi(next.data)'],
            ['\tlw\ta0, %lo(next.data)(a1)'],
            ['\taddiw\ta0, a0, 1'],
            ['\tsw\ta0, %lo(next.data)(a1)'],
            ['\t.loc\t1 3 5 epilogue_begin is_stmt 0'],
            ['\tld\tra, 8(sp)', 3],
            ['\tld\ts0, 0(sp)', 3],
            ['\taddi\tsp, sp, 16', 3],
            ['\tret', 3],
            ['.Ltmp3:'],
            ['.Lfunc_end1:'],
            ['\t.data'],
            ['next.data:'],
            ['\t.word\t40']
        ]
        expect(await unlocated('RISC-V-64', '0', source, riscv)).toEqual([
            '1 addi sp, sp, -16',
            '1 sd ra, 8(sp)',
            '1 sd s0, 0(sp)',
            '1 addi s0, sp, 16',
            '3 lui a1, %hi(next.data)',
            '3 lw a0, %lo(next.data)(a1)',
            '3 addiw a0, a0, 1',
            '3 sw a0, %lo(next.data)(a1)',
            '3 ld ra, 8(sp)',
            '3 ld s0, 0(sp)',
            '3 addi sp, sp, 16',
            '3 ret'
        ])
        const mips: ([string] | [string, number])[] = [
            ['main:'],
            ['$tmp0:'],
            ['$func_begin0 = $tmp0'],
            ...files,
            ['\t.loc\t1 5 0'],
            ['\taddiu\t$sp, $sp, -64', 5],
            ['\tsw\t$ra, 60($sp)', 5],
            ['\tsw\t$fp, 56($sp)', 5],
            ['\tmove\t$fp, $sp', 5],
            ['\tsw\t$zero, 52($fp)', 5],
            ['$tmp1:'],
            ['\t.loc\t1 6 10 prologue_end'],
            ['\tlui\t$3, %hi($__const.main.text)'],
            ['\taddiu\t$4, $3, %lo($__const.main.text)'],
            ['\t.loc\t1 0 10 is_stmt 0'],
            ['\tsw\t$4, 16($fp)', 0],
            ['\t.loc\t1 6 10'],
            ['\tlwl\t$1, 22($4)', 6],
            ['\tlwr\t$1, 19($4)', 6],
            ['\tswl\t$1, 50($fp)', 6],
            ['\tlwl\t$2, 3($4)', 6],
            ['\tlwr\t$2, %lo($__const.main.text)($3)'],
            ['\tsw\t$2, 28($fp)'],
            ['\tswr\t$1, 47($fp)'],
            ['\t.loc\t1 7 15 is_stmt 1'],
            ['\tjal\tnext', 7],
            ['\tnop', 7],
            ['\t.loc\t1 7 9 is_stmt 0'],
            ['\tsw\t$2, 24($fp)', 7]
        ]
        expect(await unlocated('MIPS', '0', source, mips)).toEqual([
            '5 addiu $sp, $sp, -64',
            '5 sw $ra, 60($sp)',
            '5 sw $fp, 56($sp)',
            '5 move $fp, $sp',
            '5 sw $zero, 52($fp)',
            '6 lui $3, %hi($__const.main.text)',
            '6 addiu $4, $3, %lo($__const.main.text)',
            '6 sw $4, 16($fp)',
            '6 lwl $1, 22($4)',
            '6 lwr $1, 19($4)',
            '6 swl $1, 50($fp)',
            '6 lwl $2, 3($4)',
            '6 lwr $2, %lo($__const.main.text)($3)',
            '6 sw $2, 28($fp)',
            '6 swr $1, 47($fp)',
            '7 jal next',
            '7 nop',
            '7 sw $2, 24($fp)'
        ])
        //whatever the optimization level, which only Clang's -O0 rules depend on
        expect(await unlocated('RISC-V-64', '2', source, riscv)).toContain(
            '3 lui a1, %hi(next.data)'
        )
    })

    it('leaves the lines of optimized Clang output as the compiler gave them', async () => {
        const lines = await unlocated('RISC-V-64', '2')
        expect(lines).toContain('4 li a0, 6')
        expect(lines).toContain('0 li a0, 7')
        expect(lines).toContain('0 lui a1, 24')
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

    it("asks GCC 14.2 for its translation profile's output, with the Runtime ABI headers", async () => {
        const headers = await loadRuntimeHeaders('v1')
        const c = createCompilerRequest(x86(), headers, GCC_INTEL_V1)
        expect(c.compilerId).toBe('cg142')
        expect(c.body.files).toContainEqual({
            filename: 'project/src/main.c',
            contents: '#line 1 "src/main.c"\nint main(void) { return 0; }\n'
        })
        expect(c.body.options.userArguments).toBe(
            "-O2 -fdiagnostics-color=never -fno-section-anchors -masm=intel -fno-pie -fno-stack-protector -fcf-protection=none -fno-verbose-asm -g1 -nostdinc -isystem sysroot/include -march=x86-64 -mtune=generic -iquote 'project/src' -iquote project -include 'project/src/main.c' -std=c17"
        )
        //the translation reads GCC's raw output, its .file and .loc directives included
        expect(Object.values(c.body.options.filters).every((filter) => filter === false)).toBe(true)
        //src/values.h is a Project header the source does not include, so it is not sent
        expect(c.body.files.map((file) => file.filename).sort()).toEqual(
            [
                'project/src/main.c',
                ...Object.keys(headers).map((name) => `sysroot/include/${name}`)
            ].sort()
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
            "-O2 -fdiagnostics-color=never -fno-section-anchors -masm=intel -fno-pie -fno-stack-protector -fcf-protection=none -fno-verbose-asm -g1 -nostdinc -isystem sysroot/include -march=x86-64 -mtune=generic -iquote 'project/src' -iquote project -include 'project/src/main.cpp' -std=c++17 -fno-exceptions -fno-rtti -fno-threadsafe-statics -nostdinc++"
        )
    })

    it('uploads <sim.h> with them', async () => {
        const headers = await loadRuntimeHeaders('v1')
        const environment = '#ifndef SIM_H\n#define SIM_H\n#endif\n'
        const c = createCompilerRequest(x86(), { ...headers, 'sim.h': environment }, GCC_INTEL_V1)
        expect(c.body.files.map((file) => file.filename).sort()).toEqual(
            [
                'project/src/main.c',
                'sysroot/include/sim.h',
                ...Object.keys(headers).map((name) => `sysroot/include/${name}`)
            ].sort()
        )
        expect(c.body.files).toContainEqual({
            filename: 'sysroot/include/sim.h',
            contents: environment
        })
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
        //GCC's .L labels are not local in NASM, so the translation renames them and records the
        //compiler's own spelling for the memory view's data labels
        expect(lines.slice(0, 5)).toEqual([
            '    default rel',
            '    ; compiler-symbol L4 .L4',
            '    ; compiler-symbol L5 .L5',
            '    section .text',
            'twice:'
        ])
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
            runtimeAbi: 'v1',
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

    it('finds main among the global definitions rather than any label of that name', async () => {
        const result = await compileSource(
            x86(),
            undefined,
            respond(output('\t.globl\tmain', 'main:', '\txor\teax, eax', '\tret'))
        )
        expect(result.assembly).toBe(
            '    default rel\n    section .text\n    global main\nmain:\n    xor eax, eax\n    ret\n'
        )
        expect(result.definesMain).toBe(true)
        for (const unit of [
            output('helper:', '\tret'),
            output('main:', '\tret'),
            output('\t.weak\tmain', 'main:', '\tret')
        ])
            expect((await compileSource(x86(), undefined, respond(unit))).definesMain).toBe(false)
    })

    // A companion File defines functions a hand-written `main.asm` links as needed (ADR 0033), and
    // no `main` of its own (programs.md, decision 9): it compiles all the same, and says so.
    it('compiles a companion File that defines no main', async () => {
        const result = await compileSource(
            x86('int sum(int a, int b) {\n    return a + b;\n}\n', 'sum.c'),
            undefined,
            respond(
                output(
                    '\t.p2align 4',
                    '\t.globl\tsum',
                    '\t.type\tsum, @function',
                    'sum:',
                    '\tlea\teax, [rdi+rsi]',
                    '\tret',
                    '\t.size\tsum, .-sum'
                )
            )
        )
        expect(result.definesMain).toBe(false)
        expect(result.assembly).toContain('    global sum\nsum:\n')
        expect(result.record).toEqual(
            expect.objectContaining({ sourcePath: 'sum.c', outputPath: 'sum.c.asm' })
        )
        expect(result.diagnostics).toEqual([])
    })

    it('rejects inline assembly it cannot translate on the line of its asm statement, in its own words', async () => {
        const source =
            'int main(void) {\n    int x = 1;\n    __asm__ volatile ("movl $1, %%eax" : : : "eax");\n    return x;\n}\n'
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
            '\tmovl $1, %eax',
            '# 0 "" 2',
            '\t.loc 1 4 12',
            '#NO_APP',
            '\tmov\teax, DWORD PTR [rbp-4]',
            '\t.loc 1 5 1',
            '\tpop\trbp',
            '\tret'
        )
        // The bounded Intel subset identifies AT&T syntax specifically.
        const [rejection] = translateCompilerOutput(
            response.asm.map((line) => line.text),
            { profile: GCC_INTEL_V1.id }
        ).diagnostics
        expect(rejection.message).toMatch(/AT&T syntax/)
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
                message: rejection.message,
                hint: expect.stringContaining('in a .asm File of the Project'),
                line: {
                    line: '    __asm__ volatile ("movl $1, %%eax" : : : "eax");',
                    line_index: 2
                }
            })
        ])
    })

    it('translates inline assembly written as GCC writes Intel syntax', async () => {
        const source = 'int main(void) {\n    __asm__ volatile ("nop");\n    return 0;\n}\n'
        const result = await compileSource(
            x86(source),
            undefined,
            respond(
                output(
                    '\t.globl\tmain',
                    '\t.type\tmain, @function',
                    'main:',
                    '\t.file 1 "src/main.c"',
                    '\t.loc 1 2 5',
                    '#APP',
                    '# 2 "src/main.c" 1',
                    '\tnop',
                    '# 0 "" 2',
                    '\t.loc 1 3 12',
                    '#NO_APP',
                    '\txor\teax, eax',
                    '\t.loc 1 4 1',
                    '\tret'
                )
            )
        )
        const lines = result.assembly.split('\n')
        expect(result.diagnostics).toEqual([])
        expect(result.map.lines[lines.indexOf('    nop')]).toEqual({
            path: 'src/main.c',
            line: 1
        })
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

    it('reports unavailable headers without claiming x86 lacks a runtime', async () => {
        const error = await failure(x86('#include <vector>\n'), {
            code: 1,
            stderr: [{ text: 'src/main.c:1:10: fatal error: vector: No such file or directory' }]
        })
        expect(error.diagnostics[0].message).toBe('vector: No such file or directory')
        expect(error.diagnostics[0].hint).toBeUndefined()
    })
})
