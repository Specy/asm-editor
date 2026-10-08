import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushSync } from 'svelte'
import { makeProject } from '$lib/Project.svelte'
import { compilerExplorerDriver, compileSource } from '$lib/sourceCompilation/compilerExplorer'
import fixture from '$lib/sourceCompilation/fixtures/risc-v-c-O0.json'
import { PlaygroundSession } from './PlaygroundSession.svelte'
import { decodePlaygroundProgram, encodePlaygroundProgram } from './playgroundProgram'
import type monaco from 'monaco-editor'
import { resolveSourceHelpContext } from '$lib/sourceLanguageHelp/context'
import { includeSuggestions } from '$lib/sourceLanguageHelp/includes'
import { sourceHelpEntries } from '$lib/sourceLanguageHelp/catalog'

vi.mock('$lib/storage/db', () => ({ db: { getProjects: async () => [] }, id: () => 'test' }))
const text = (content: string) => ({ encoding: 'plain' as const, content })
const disposers: (() => void)[] = []
function setup(assemblyEntry = false) {
    const session = new PlaygroundSession(
        makeProject({
            language: 'RISC-V',
            entry: assemblyEntry ? 'driver.s' : fixture.sourcePath,
            files: {
                [fixture.sourcePath]: text(fixture.source),
                ...Object.fromEntries(
                    Object.entries(fixture.headers).map(([path, content]) => [path, text(content)])
                ),
                ...(assemblyEntry ? { 'driver.s': text('.include "src/main.c.riscv"') } : {})
            }
        })
    )
    disposers.push(() => session.cancel())
    flushSync()
    return session
}

afterEach(() => {
    disposers.splice(0).forEach((dispose) => dispose())
    vi.restoreAllMocks()
})

describe('playground compilation lifecycle', () => {
    it.each([
        ['main.c', 'c', 'stdio.h'],
        ['main.cpp', 'cpp', 'cstdio']
    ] as const)(
        'provides named %s models with headers and function help',
        async (path, language, header) => {
            const session = setup()
            session.edit(path, 'int main(void) { return 0; }')
            const unregister = session.registerSourceHelp('named-playground')
            disposers.push(unregister)
            const model = {
                uri: { scheme: 'asm-editor', authority: 'named-playground', path: `/live/${path}` },
                isDisposed: () => false,
                getVersionId: () => 1
            } as unknown as monaco.editor.ITextModel
            const context = resolveSourceHelpContext(model)!
            expect(context.language).toBe(language)
            expect(context.capabilities?.target).toBe('RISC-V')
            expect(
                includeSuggestions(context, { kind: 'system', prefix: '', start: 0, end: 0 }).map(
                    (suggestion) => suggestion.name
                )
            ).toContain(header)
            expect(await sourceHelpEntries(context.capabilities, context.language)).toContainEqual(
                expect.objectContaining({ name: 'sim_print_int', parameters: expect.any(Array) })
            )
            session.edit('new.h', '#define ANSWER 42')
            flushSync()
            expect(context.current()).toBe(false)
            const updated = resolveSourceHelpContext(model)!
            expect(
                includeSuggestions(updated, { kind: 'quoted', prefix: '', start: 0, end: 0 }).map(
                    (suggestion) => suggestion.name
                )
            ).toContain('new.h')
            unregister()
            expect(updated.current()).toBe(false)
            expect(resolveSourceHelpContext(model)).toBeUndefined()
        }
    )

    it('compiles source plus headers, selects generated assembly and carries startup provenance through a URL', async () => {
        const session = setup()
        const compile = vi
            .spyOn(compilerExplorerDriver, 'compile')
            .mockImplementation((request, signal) =>
                compileSource(
                    request,
                    signal,
                    vi.fn(async () => new Response(JSON.stringify(fixture.response)))
                )
            )
        expect(session.needsCompilation).toBe(true)
        expect(session.optimization).toBe('0')
        await session.compile(vi.fn())
        flushSync()
        expect(compile.mock.calls[0][0].files['src/values.h'].content).toBe(
            fixture.headers['src/values.h']
        )
        expect(compile.mock.calls[0][0].optimization).toBe('0')
        expect(session.selected).toBe('src/main.c.riscv')
        expect(session.project.entry).toBe(session.selected)
        expect(session.sources.assemblerProfile).toBe('gnu-compiler-v1')
        expect(session.sources.entrySymbol).toBe('_start')
        expect(session.sources.runtimeAbi).toBe('v1')
        expect(session.needsCompilation).toBe(false)
        expect(session.recompilationNeeded).toBe(false)
        const reopened = decodePlaygroundProgram(
            encodePlaygroundProgram(session.project.toObject())
        )
        expect(reopened.compilations).toEqual(session.project.compilations)
        expect(Object.keys(reopened.files)).toEqual([
            'src/main.c',
            'src/values.h',
            'src/main.c.riscv'
        ])
        session.edit('src/values.h', '#define twice(x) ((x) * 3)')
        flushSync()
        expect(session.needsCompilation).toBe(true)
        expect(session.recompilationNeeded).toBe(true)
    })

    it('offers compilation only for the selected source or generated assembly file', () => {
        const session = setup()
        session.selected = 'src/values.h'
        expect(session.sourcePath).toBeUndefined()
        session.selected = 'src/main.c'
        expect(session.sourcePath).toBe('src/main.c')
    })

    it('keeps a hand-authored assembly entry when compiling a companion C file', async () => {
        const session = setup(true)
        session.selected = 'src/main.c'
        vi.spyOn(compilerExplorerDriver, 'compile').mockImplementation((request, signal) =>
            compileSource(
                request,
                signal,
                vi.fn(async () => new Response(JSON.stringify(fixture.response)))
            )
        )
        await session.compile(vi.fn())
        flushSync()
        expect(session.project.entry).toBe('driver.s')
        expect(session.sources.entrySymbol).toBe('_start')
        expect(session.sources.assemblerProfile).toBe('gnu-compiler-v1')
    })

    it('cancels an in-flight compile without publishing generated files', async () => {
        const session = setup()
        let resolve!: (value: Response) => void
        vi.spyOn(compilerExplorerDriver, 'compile').mockImplementation((request, signal) =>
            compileSource(
                request,
                signal,
                vi.fn(
                    () =>
                        new Promise<Response>((done) => {
                            resolve = done
                        })
                )
            )
        )
        const pending = session.compile(vi.fn())
        await vi.waitFor(() => expect(resolve).toBeDefined())
        session.cancel()
        resolve(new Response(JSON.stringify(fixture.response)))
        expect(await pending).toBe(false)
        expect(session.project.files['src/main.c.riscv']).toBeUndefined()
        expect(session.compiling).toBe(false)
    })

    it('rejects source edits made during compilation and reports compiler diagnostics', async () => {
        const session = setup()
        const compile = vi
            .spyOn(compilerExplorerDriver, 'compile')
            .mockImplementation(async (request, signal) => {
                const result = await compileSource(
                    request,
                    signal,
                    vi.fn(async () => new Response(JSON.stringify(fixture.response)))
                )
                session.edit('src/main.c', fixture.source + '\n/* edited */')
                return result
            })
        await expect(session.compile(vi.fn())).rejects.toThrow('changed during compilation')
        expect(session.project.files['src/main.c.riscv']).toBeUndefined()
        compile.mockImplementation((request, signal) =>
            compileSource(
                request,
                signal,
                vi.fn(
                    async () =>
                        new Response(
                            JSON.stringify({
                                code: 1,
                                stderr: [{ text: 'src/main.c:2:1: error: broken' }],
                                asm: []
                            })
                        )
                )
            )
        )
        await expect(session.compile(vi.fn())).rejects.toThrow()
        expect(
            session.diagnostics.some((diagnostic) => diagnostic.message.includes('broken'))
        ).toBe(true)
    })
})
