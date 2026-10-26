import { describe, expect, it, vi } from 'vite-plus/test'
import {
    makeProject,
    normalizeProjectData,
    projectContentEquals,
    type Program,
    type Testcase
} from '#lib/Project.svelte.ts'
import { makeProjectFromArchive, projectToArchive } from '#lib/projectArchive.ts'
import { BASE_CODE } from '#lib/Config.ts'
import { compileProjectSource } from './compileProjectSource'
import {
    fileFingerprint,
    compilationStatus,
    cleanCompilationRecords,
    defaultSourceCompiler,
    isCompilationTarget,
    sourceTemplate
} from './records'
import {
    SourceCompilationError,
    type CompilationRequest,
    type CompilationResult
} from './compilerExplorer'

const text = (content: string) => ({ encoding: 'plain' as const, content })
const OUTPUT = 'src/main.c.riscv'
const FILES = {
    'src/main.c': text('#include "value.h"\nint main(void) { return VALUE; }'),
    'src/add.c': text('int add(int a, int b) { return a + b; }'),
    'src/value.h': text('#define VALUE 42'),
    'original.riscv': text('li a7, 10\necall')
}
function project() {
    return makeProject({ language: 'RISC-V', entry: 'original.riscv', files: FILES })
}
/** A Compiler driver whose every compile outputs `assembly`. */
function driver(assembly: string) {
    return (request: CompilationRequest): Promise<CompilationResult> => {
        const hash = fileFingerprint(text(assembly))!
        return Promise.resolve({
            assembly,
            diagnostics: [],
            definesMain: /^\.globl main$/m.test(assembly),
            record: {
                assemblerProfile: 'gnu-compiler-v1',
                sourcePath: request.sourcePath,
                outputPath: request.outputPath,
                target: request.target,
                language: 'c',
                compilerId: 'rv32-cgcc1420',
                optimization: request.optimization,
                inputs: {
                    [request.sourcePath]: fileFingerprint(request.files[request.sourcePath])!,
                    'src/value.h': fileFingerprint(request.files['src/value.h'])!
                },
                outputFingerprint: hash
            },
            map: {
                sourcePath: request.sourcePath,
                outputFingerprint: hash,
                lines: assembly
                    .split('\n')
                    .map((_, index) => (index === 3 ? { path: request.sourcePath, line: 1 } : null))
            }
        })
    }
}
const compile = driver('.text\n.globl main\nmain:\nli a0, 42\nli a7, 93\necall\n')
//a companion File's, which another includes and which defines no `main` (programs.md, decision 9)
const COMPANION = '.text\n.globl add\nadd:\nadd a0, a0, a1\nret\n'
const companion = driver(COMPANION)
async function initial(p = project()) {
    await compileProjectSource(p, 'src/main.c', '0', { compile, confirm: vi.fn() })
    return p
}
function testcase(expectedOutput: string): Testcase {
    return {
        input: [],
        expectedOutput,
        startingRegisters: {},
        expectedRegisters: {},
        startingMemory: [],
        expectedMemory: []
    }
}

describe('Source compilation lifecycle', () => {
    it('publishes one output as a selected Program and saves provenance through reopening/archives without the map', async () => {
        const p = await initial()
        expect(p.selectedProgram).toBe(OUTPUT)
        expect(p.sourceMaps[OUTPUT]).toBeDefined()
        expect(p.toObject()).not.toHaveProperty('sourceMaps')
        for (const reopened of [
            makeProject(p.toObject()),
            makeProjectFromArchive(projectToArchive(p)).project
        ]) {
            expect(reopened.compilations).toEqual(p.compilations)
            expect(reopened.sourceMaps).toEqual({})
            expect(
                compilationStatus(reopened.compilations[0], reopened.files, reopened.language)
            ).toEqual({ stale: false, edited: false })
        }
        // Metadata-only autosaving must not throw away a working map.
        p.set({ updatedAt: Date.now() })
        expect(p.sourceMaps[OUTPUT]).toBeDefined()
    })
    it('invalidates on source/header edits and deletion while retaining stale detection; Undo does not resurrect a map', async () => {
        for (const path of ['src/main.c', 'src/value.h']) {
            const p = await initial()
            const previous = p.files[path].content
            p.fileSystem.writeText(path, previous + '\n')
            expect(p.sourceMaps).toEqual({})
            expect(compilationStatus(p.compilations[0], p.files, p.language).stale).toBe(true)
            p.fileSystem.writeText(path, previous)
            expect(p.sourceMaps).toEqual({})
            p.fileSystem.remove(path)
            expect(compilationStatus(p.compilations[0], p.files, p.language).stale).toBe(true)
        }
    })
    it('confirms edited output even after reopening and respects cancellation', async () => {
        const p = await initial()
        p.fileSystem.writeText(OUTPUT, p.code + '# manually edited\n')
        const reopened = makeProject(p.toObject())
        const before = reopened.toObject()
        const confirm = vi.fn(async (_question: string) => false)
        await compileProjectSource(reopened, 'src/main.c', '2', { compile, confirm })
        expect(confirm).toHaveBeenCalledOnce()
        expect(confirm.mock.calls[0][0]).toContain('edited manually')
        expect(projectContentEquals(before, reopened.toObject())).toBe(true)
        await compileProjectSource(reopened, 'src/main.c', '2', {
            compile,
            confirm: async () => true
        })
        expect(reopened.compilations[0].optimization).toBe('2')
        expect(reopened.sourceMaps[OUTPUT]).toBeDefined()
    })
    it('asks for unowned collisions, and overwrites untouched generated output without asking', async () => {
        const p = project()
        p.fileSystem.writeText(OUTPUT, 'handwritten assembly')
        const confirm = vi.fn(async () => true)
        await compileProjectSource(p, 'src/main.c', '0', { compile, confirm })
        expect(confirm).toHaveBeenCalledOnce()
        confirm.mockClear()
        await compileProjectSource(p, 'src/main.c', '2', { compile, confirm })
        expect(confirm).not.toHaveBeenCalled()
    })
    it('failed compilation preserves all existing output and provenance', async () => {
        const p = await initial()
        const before = p.toObject(),
            map = p.sourceMaps[OUTPUT]
        await expect(
            compileProjectSource(p, 'src/main.c', '2', {
                compile: async () => {
                    throw new SourceCompilationError('Compiler failed')
                },
                confirm: vi.fn()
            })
        ).rejects.toThrow('Compiler failed')
        expect(projectContentEquals(before, p.toObject())).toBe(true)
        expect(p.sourceMaps[OUTPUT]).toBe(map)
    })
    it('discards responses if source/header/destination changes or a Debug session begins while compiling', async () => {
        for (const change of ['source', 'header', 'destination', 'debug']) {
            const p = project()
            const operation = compileProjectSource(p, 'src/main.c', '0', {
                compile: async (request) => {
                    if (change === 'source')
                        p.fileSystem.writeText('src/main.c', 'int main(void) { return 0; }')
                    if (change === 'header')
                        p.fileSystem.writeText('src/value.h', '#define VALUE 7')
                    if (change === 'destination')
                        p.fileSystem.writeText(request.outputPath, 'do not replace')
                    if (change === 'debug') p.fileSystem.beginSession()
                    return compile(request)
                },
                confirm: vi.fn()
            })
            await expect(operation).rejects.toThrow()
            expect(Object.keys(p.programs)).toEqual(['original.riscv'])
            expect(p.selectedProgram).toBe('original.riscv')
            expect(p.compilations).toEqual([])
            expect(p.sourceMaps).toEqual({})
            p.fileSystem.stop()
        }
    })
    it('rechecks after overwrite confirmation and honours cancellation signals', async () => {
        const p = await initial()
        p.fileSystem.writeText(OUTPUT, 'manual')
        await expect(
            compileProjectSource(p, 'src/main.c', '0', {
                compile,
                confirm: async () => {
                    p.fileSystem.writeText(OUTPUT, 'new manual edit')
                    return true
                }
            })
        ).rejects.toThrow('changed during compilation')
        expect(p.code).toBe('new manual edit')
        const controller = new AbortController()
        await expect(
            compileProjectSource(p, 'src/main.c', '0', {
                compile: async (request) => {
                    controller.abort()
                    return compile(request)
                },
                confirm: vi.fn(),
                signal: controller.signal
            })
        ).rejects.toThrow()
        expect(p.code).toBe('new manual edit')
    })
    it('keeps output ownership through renames without silently renaming assembly', async () => {
        const p = await initial()
        p.fileSystem.rename('src/main.c', 'src/renamed.c')
        p.renameCompilationFile('src/main.c', 'src/renamed.c')
        expect(p.compilations[0].sourcePath).toBe('src/renamed.c')
        expect(p.compilations[0].outputPath).toBe(OUTPUT)
        expect(compilationStatus(p.compilations[0], p.files, p.language).stale).toBe(true)
        p.selectProgram('original.riscv')
        const result = await compileProjectSource(p, 'src/renamed.c', '0', {
            compile,
            confirm: vi.fn()
        })
        expect(result?.program).toBe('selected')
        expect(p.selectedProgram).toBe(OUTPUT)
        expect(p.sourceMaps[OUTPUT]).toBeDefined()
    })
    it('keeps every Source map through the rename of a File no record names', async () => {
        const p = await initial()
        p.fileSystem.writeText('notes.txt', 'notes')
        expect(p.sourceMaps[OUTPUT]).toBeDefined()
        //the Explorer's rename: the File, then what followed it
        p.fileSystem.rename('notes.txt', 'notes.md')
        p.renameCompilationFile('notes.txt', 'notes.md')
        expect(p.sourceMaps[OUTPUT]).toBeDefined()
        //a renamed input makes its record stale, which takes its map
        p.fileSystem.rename('src/value.h', 'src/values.h')
        p.renameCompilationFile('src/value.h', 'src/values.h')
        expect(p.compilations[0].renamedInput).toBe(true)
        expect(p.sourceMaps[OUTPUT]).toBeUndefined()
    })
    it('rejects invalid saved provenance and leaves older Projects compatible', async () => {
        expect(normalizeProjectData({ code: 'nop' })).not.toHaveProperty('compilations')
        const p = await initial()
        const record = p.compilations[0]
        expect(() => cleanCompilationRecords([{ ...record, outputPath: '../outside' }])).toThrow(
            'Invalid Compilation'
        )
        expect(() => cleanCompilationRecords([record, record])).toThrow('Invalid Compilation')
        expect(() =>
            cleanCompilationRecords([{ ...record, inputs: { '../bad': 'no hash' } }])
        ).toThrow('Invalid Compilation')
    })
})

// A Program is identified by its Entry file (ADR 0054), and a Compile gives the Generated assembly
// one only when it is a program (programs.md, decision 9).
describe('the Programs a Compile leaves', () => {
    const confirm = vi.fn(async () => true)
    const withPrograms = (
        programs: Record<string, Program>,
        selectedProgram?: string,
        files: Record<string, ReturnType<typeof text>> = {}
    ) =>
        makeProject({
            language: 'RISC-V',
            files: { ...FILES, ...files },
            programs,
            ...(selectedProgram ? { selectedProgram } : {})
        })

    it('creates and selects a Program for a source that defines main, the others kept as they were', async () => {
        for (const p of [project(), withPrograms({})]) {
            const others = p.toObject().programs
            const result = await compileProjectSource(p, 'src/main.c', '0', { compile, confirm })
            expect(result).toMatchObject({ program: 'created', definesMain: true })
            expect(p.selectedProgram).toBe(OUTPUT)
            expect(p.toObject().programs).toEqual({
                ...others,
                [OUTPUT]: { settings: {}, testcases: [] }
            })
        }
    })

    it("selects the Generated assembly's Program on a recompile, main or not", async () => {
        const p = await initial()
        p.setProgramTestcases(OUTPUT, [testcase('42')])
        for (const recompile of [compile, companion]) {
            p.selectProgram('original.riscv')
            const result = await compileProjectSource(p, 'src/main.c', '2', {
                compile: recompile,
                confirm
            })
            expect(result?.program).toBe('selected')
            expect(p.selectedProgram).toBe(OUTPUT)
            expect(p.program(OUTPUT)?.testcases).toEqual([testcase('42')])
        }
        expect(Object.keys(p.programs).sort()).toEqual(['original.riscv', OUTPUT])
    })

    // Earlier data and a Playground's authored C entry can have one (programs-plan.md, decision 2).
    it('moves a Program whose Entry is the source to its Generated assembly, main or not, and selects it', async () => {
        for (const [recompile, selected] of [
            [compile, 'src/main.c'],
            [companion, 'original.riscv']
        ] as const) {
            const p = withPrograms(
                {
                    'src/main.c': {
                        settings: { programArguments: 'one two' },
                        testcases: [testcase('42')]
                    },
                    'original.riscv': { settings: {}, testcases: [] }
                },
                selected
            )
            const testcases = p.program('src/main.c')!.testcases
            const result = await compileProjectSource(p, 'src/main.c', '0', {
                compile: recompile,
                confirm
            })
            expect(result?.program).toBe('moved')
            expect(p.selectedProgram).toBe(OUTPUT)
            expect(p.program('src/main.c')).toBeUndefined()
            expect(p.program(OUTPUT)?.settings).toEqual({ programArguments: 'one two' })
            expect(p.program(OUTPUT)?.testcases).toBe(testcases)
            expect(p.program('original.riscv')).toBeDefined()
        }
    })

    it("selects the Generated assembly's own Program before moving the source's", async () => {
        const p = withPrograms(
            {
                'src/main.c': { settings: {}, testcases: [testcase('source')] },
                [OUTPUT]: { settings: {}, testcases: [testcase('assembly')] }
            },
            'src/main.c',
            { [OUTPUT]: text('') }
        )
        const result = await compileProjectSource(p, 'src/main.c', '0', { compile, confirm })
        expect(result?.program).toBe('selected')
        expect(p.selectedProgram).toBe(OUTPUT)
        expect(p.program('src/main.c')?.testcases).toEqual([testcase('source')])
    })

    it('leaves the Programs and the selection alone for a companion File without main', async () => {
        for (const p of [await initial(), withPrograms({})]) {
            if (p.selectedProgram) p.selectProgram('original.riscv')
            const before = p.toObject()
            const result = await compileProjectSource(p, 'src/add.c', '0', {
                compile: companion,
                confirm
            })
            expect(result).toMatchObject({ program: 'none', definesMain: false })
            expect(p.toObject().programs).toEqual(before.programs)
            expect(p.selectedProgram).toBe(before.selectedProgram)
            //compiled all the same, for the File that includes it
            expect(p.files['src/add.c.riscv']).toEqual(text(COMPANION))
            expect(p.compilations.at(-1)?.sourcePath).toBe('src/add.c')
        }
    })

    it('makes no Program when the caller says not to, and still selects or moves one', async () => {
        const fixed = { compile, confirm, newProgram: 'none' } as const
        const p = project()
        expect(await compileProjectSource(p, 'src/main.c', '0', fixed)).toMatchObject({
            program: 'none',
            definesMain: true
        })
        expect(Object.keys(p.programs)).toEqual(['original.riscv'])
        expect(p.selectedProgram).toBe('original.riscv')
        const playground = withPrograms({ 'src/main.c': { settings: {}, testcases: [] } })
        expect((await compileProjectSource(playground, 'src/main.c', '0', fixed))?.program).toBe(
            'moved'
        )
        expect((await compileProjectSource(playground, 'src/main.c', '2', fixed))?.program).toBe(
            'selected'
        )
        expect(Object.keys(playground.programs)).toEqual([OUTPUT])
    })

    // A host with exactly one Program, such as /chat, keeps it one: the old Entry's move.
    it('moves the Selected program to a source that defines main when the caller has one Program', async () => {
        const one = { compile, confirm, newProgram: 'move' } as const
        const p = withPrograms(
            {
                'original.riscv': {
                    settings: { programArguments: 'one two' },
                    testcases: [testcase('42')]
                }
            },
            'original.riscv'
        )
        const testcases = p.program('original.riscv')!.testcases
        expect(await compileProjectSource(p, 'src/main.c', '0', one)).toMatchObject({
            program: 'moved',
            definesMain: true
        })
        expect(Object.keys(p.programs)).toEqual([OUTPUT])
        expect(p.selectedProgram).toBe(OUTPUT)
        expect(p.program(OUTPUT)?.settings).toEqual({ programArguments: 'one two' })
        expect(p.program(OUTPUT)?.testcases).toBe(testcases)
        //the File stays, as it stayed when the one Entry moved
        expect(p.files['original.riscv']).toEqual(FILES['original.riscv'])
        //a companion still leaves it, and a recompile selects it where it is
        expect(
            (await compileProjectSource(p, 'src/add.c', '0', { ...one, compile: companion }))
                ?.program
        ).toBe('none')
        expect((await compileProjectSource(p, 'src/main.c', '2', one))?.program).toBe('selected')
        expect(Object.keys(p.programs)).toEqual([OUTPUT])

        //with no Program to move, the Compile makes the one
        const empty = withPrograms({})
        expect((await compileProjectSource(empty, 'src/main.c', '0', one))?.program).toBe('created')
        expect(Object.keys(empty.programs)).toEqual([OUTPUT])
        expect(empty.selectedProgram).toBe(OUTPUT)
    })
})

describe('x86 Source compilation', () => {
    function x86Project(files: Record<string, ReturnType<typeof text>> = {}) {
        return makeProject({
            language: 'X86',
            entry: 'main.asm',
            files: {
                'main.asm': text(BASE_CODE.X86),
                'src/main.c': text('int main(void) { return 42; }\n'),
                ...files
            }
        })
    }
    function compileX86(
        request: CompilationRequest,
        assembly = '    global main\nmain:\n    ret\n'
    ) {
        const hash = fileFingerprint(text(assembly))!
        return Promise.resolve<CompilationResult>({
            assembly,
            diagnostics: [],
            definesMain: /^\s*global main$/m.test(assembly),
            record: {
                sourcePath: request.sourcePath,
                outputPath: request.outputPath,
                target: request.target,
                language: 'c',
                compilerId: 'cg142',
                optimization: request.optimization,
                inputs: {
                    [request.sourcePath]: fileFingerprint(request.files[request.sourcePath])!
                },
                outputFingerprint: hash
            },
            map: {
                sourcePath: request.sourcePath,
                outputFingerprint: hash,
                lines: [null, null, { path: request.sourcePath, line: 0 }, null]
            }
        })
    }

    //a hand-written `_start` is live checking's to report, so the warning goes once it is fixed
    it('leaves the _start of a new Project to live checking', async () => {
        const p = x86Project()
        const result = await compileProjectSource(p, 'src/main.c', '0', {
            compile: (request) => compileX86(request),
            confirm: vi.fn()
        })
        expect(result?.program).toBe('created')
        expect(p.selectedProgram).toBe('src/main.c.asm')
        expect(result?.diagnostics).toEqual([])
    })

    //`main.asm` links what it calls from the companion's Generated assembly as needed (ADR 0033)
    it('keeps a hand-written main.asm selected when compiling a companion File', async () => {
        const p = x86Project({ 'src/sum.c': text('int sum(int a, int b) { return a + b; }\n') })
        const result = await compileProjectSource(p, 'src/sum.c', '0', {
            compile: (request) =>
                compileX86(request, '    global sum\nsum:\n    lea eax, [rdi+rsi]\n    ret\n'),
            confirm: vi.fn()
        })
        expect(result).toMatchObject({ program: 'none', definesMain: false })
        expect(Object.keys(p.programs)).toEqual(['main.asm'])
        expect(p.selectedProgram).toBe('main.asm')
        expect(p.files['src/sum.c.asm']).toBeDefined()
    })

    it('records no assembler profile or Runtime ABI, and keeps the record through saving', async () => {
        const p = x86Project({ 'main.asm': text('') })
        await compileProjectSource(p, 'src/main.c', '2', {
            compile: (request) => compileX86(request),
            confirm: vi.fn()
        })
        const [record] = p.compilations
        expect(record).not.toHaveProperty('assemblerProfile')
        expect(record).not.toHaveProperty('runtimeAbi')
        for (const reopened of [
            makeProject(p.toObject()),
            makeProjectFromArchive(projectToArchive(p)).project
        ]) {
            expect(reopened.compilations).toEqual(p.compilations)
        }
        //NASM, which no GNU assembler profile reads
        expect(() =>
            cleanCompilationRecords([{ ...record, assemblerProfile: 'gnu-compiler-v1' }])
        ).toThrow('Unsupported assembler profile')
        //a later editor's, which blocks the Build until the source is compiled again
        expect(cleanCompilationRecords([{ ...record, runtimeAbi: 'v1' }])?.[0].runtimeAbi).toBe(
            'v1'
        )
        expect(() => cleanCompilationRecords([{ ...record, target: 'M68K' }])).toThrow(
            'Invalid Compilation record'
        )
    })

    it('compiles for x86 with GCC, from the template of a program that prints', async () => {
        expect(isCompilationTarget('X86')).toBe(true)
        expect(defaultSourceCompiler('X86')).toBe('gcc')
        expect(defaultSourceCompiler('RISC-V')).toBe('clang')
        expect(sourceTemplate('X86', 'cpp')).toBe(sourceTemplate('RISC-V', 'cpp'))
        expect(sourceTemplate('X86', 'c')).toContain('printf(')
        expect(isCompilationTarget('M68K')).toBe(false)
        const p = makeProject({
            language: 'M68K',
            entry: 'main.m68k',
            files: { 'main.m68k': text(''), 'main.c': text('int main(void) { return 0; }') }
        })
        await expect(
            compileProjectSource(p, 'main.c', '0', { compile: vi.fn(), confirm: vi.fn() })
        ).rejects.toThrow('Source compilation is available for MIPS, RISC-V and x86 Projects.')
    })
})
