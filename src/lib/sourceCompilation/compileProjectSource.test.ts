import { describe, expect, it, vi } from 'vitest'
import { makeProject, normalizeProjectData, projectContentEquals } from '$lib/Project.svelte'
import { makeProjectFromArchive, projectToArchive } from '$lib/projectArchive'
import { compileProjectSource } from './compileProjectSource'
import { fileFingerprint, compilationStatus, cleanCompilationRecords } from './records'
import {
    SourceCompilationError,
    type CompilationRequest,
    type CompilationResult
} from './compilerExplorer'

const text = (content: string) => ({ encoding: 'plain' as const, content })
function project() {
    return makeProject({
        language: 'RISC-V',
        entry: 'original.riscv',
        files: {
            'src/main.c': text('#include "value.h"\nint main(void) { return VALUE; }'),
            'src/value.h': text('#define VALUE 42'),
            'original.riscv': text('li a7, 10\necall')
        }
    })
}
function compile(request: CompilationRequest): Promise<CompilationResult> {
    const assembly = '.text\nmain:\nli a0, 42\nli a7, 93\necall\n'
    const hash = fileFingerprint(text(assembly))!
    return Promise.resolve({
        assembly,
        diagnostics: [],
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
            lines: [null, null, { path: request.sourcePath, line: 1 }, null, null, null]
        }
    })
}
async function initial(p = project()) {
    await compileProjectSource(p, 'src/main.c', '0', { compile, confirm: vi.fn() })
    return p
}

describe('Source compilation lifecycle', () => {
    it('publishes one output as Entry and saves provenance through reopening/archives without the map', async () => {
        const p = await initial()
        expect(p.entry).toBe('src/main.c.riscv')
        expect(p.sourceMaps[p.entry]).toBeDefined()
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
        expect(p.sourceMaps[p.entry]).toBeDefined()
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
        p.fileSystem.writeText(p.entry, p.code + '# manually edited\n')
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
        expect(reopened.sourceMaps[reopened.entry]).toBeDefined()
    })
    it('asks for unowned collisions, and overwrites untouched generated output without asking', async () => {
        const p = project()
        p.fileSystem.writeText('src/main.c.riscv', 'handwritten assembly')
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
            map = p.sourceMaps[p.entry]
        await expect(
            compileProjectSource(p, 'src/main.c', '2', {
                compile: async () => {
                    throw new SourceCompilationError('Compiler failed')
                },
                confirm: vi.fn()
            })
        ).rejects.toThrow('Compiler failed')
        expect(projectContentEquals(before, p.toObject())).toBe(true)
        expect(p.sourceMaps[p.entry]).toBe(map)
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
            expect(p.entry).toBe('original.riscv')
            expect(p.compilations).toEqual([])
            expect(p.sourceMaps).toEqual({})
            p.fileSystem.stop()
        }
    })
    it('rechecks after overwrite confirmation and honours cancellation signals', async () => {
        const p = await initial()
        p.fileSystem.writeText(p.entry, 'manual')
        await expect(
            compileProjectSource(p, 'src/main.c', '0', {
                compile,
                confirm: async () => {
                    p.fileSystem.writeText(p.entry, 'new manual edit')
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
        expect(p.compilations[0].outputPath).toBe('src/main.c.riscv')
        expect(compilationStatus(p.compilations[0], p.files, p.language).stale).toBe(true)
        await compileProjectSource(p, 'src/renamed.c', '0', { compile, confirm: vi.fn() })
        expect(p.entry).toBe('src/main.c.riscv')
        expect(p.sourceMaps[p.entry]).toBeDefined()
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
