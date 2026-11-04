import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { MonacoType } from '#lib/monaco/Monaco.ts'
import { cleanFiles, normalizeBuildInput, textFile } from '#lib/projectFiles.ts'
import { x86SystemIncludes } from '#lib/languages/X86/x86Project.ts'
import { registerLanguageSession } from './sessionRegistry'
import { projectSourceUri } from './uri'
import {
    createProjectDefinitionProvider,
    createProjectDocumentLinkProvider,
    createProjectDocumentSymbolProvider,
    createProjectSymbolCompletionProvider,
    createProjectSymbolHoverProvider
} from './projectAssemblyLanguage'

class Range {
    constructor(
        readonly startLineNumber: number,
        readonly startColumn: number,
        readonly endLineNumber: number,
        readonly endColumn: number
    ) {}
}

const monaco = {
    Range,
    Uri: { from: (parts: { scheme: string; authority: string; path: string }) => parts },
    languages: {
        CompletionItemKind: { Constant: 1, Reference: 2, File: 3 },
        SymbolKind: { Constant: 1, Method: 2, Namespace: 3, Field: 4, Function: 5 }
    }
} as unknown as MonacoType

const sessionId = 'project-features-test'
const sources = normalizeBuildInput({
    entry: 'src/main.s',
    files: {
        'src/main.s': {
            encoding: 'plain',
            content:
                '.text\n.eqv SIZE 4\n.macro twice reg\n.end_macro\n.include "../lib/util.s"\nmain: nop'
        },
        'lib/util.s': { encoding: 'plain', content: 'data: .word 1' },
        'other.s': { encoding: 'plain', content: 'hidden: nop' }
    }
})
const options = { comment: '#' as const, dialect: 'mars' as const }
let unregister: () => void

function model(path: string, currentLine = 1) {
    const lines =
        sources.files[path]?.encoding === 'plain' ? sources.files[path].content.split('\n') : []
    return {
        uri: projectSourceUri(monaco, { sessionId, sourceKind: 'live', path }),
        getLineCount: () => lines.length,
        getLineContent: (line: number) => lines[line - 1] ?? '',
        getValueInRange: () => lines[currentLine - 1] ?? '',
        getWordUntilPosition: () => ({ word: '', startColumn: 1, endColumn: 1 })
    }
}

beforeEach(() => {
    unregister = registerLanguageSession({
        sessionId,
        sources,
        snapshot: undefined,
        sourcesFor: () => sources
    })
})

afterEach(() => unregister())

describe('common Project language features', () => {
    it('links relative includes and completes Project paths', async () => {
        const links = await createProjectDocumentLinkProvider(monaco, options).provideLinks(
            model('src/main.s') as never,
            {} as never
        )
        expect(links?.links).toContainEqual(
            expect.objectContaining({ url: expect.objectContaining({ path: '/live/lib/util.s' }) })
        )

        const prefix = '.include "../l'
        const completionModel = {
            ...model('src/main.s'),
            getValueInRange: () => prefix,
            getWordUntilPosition: () => ({
                word: 'l',
                startColumn: prefix.length,
                endColumn: prefix.length + 1
            })
        }
        const completions = await createProjectSymbolCompletionProvider(
            monaco,
            options
        ).provideCompletionItems(
            completionModel as never,
            { lineNumber: 1, column: prefix.length + 1 } as never,
            {} as never,
            {} as never
        )
        expect(completions?.suggestions).toContainEqual(
            expect.objectContaining({ label: 'lib/util.s', insertText: '../lib/util.s' })
        )
    })

    it('links the quoted incbin path when its spelling also occurs in a label', async () => {
        const x86Sources = normalizeBuildInput({
            entry: 'main.asm',
            files: {
                'main.asm': { encoding: 'plain', content: 'blob: incbin "blob"' },
                blob: { encoding: 'base64', content: 'AQ==' }
            }
        })
        const x86SessionId = 'x86-link-range-test'
        const unregisterX86 = registerLanguageSession({
            sessionId: x86SessionId,
            sources: x86Sources,
            snapshot: undefined,
            sourcesFor: () => x86Sources
        })
        try {
            const links = await createProjectDocumentLinkProvider(monaco, {
                comment: ';',
                dialect: 'x86'
            }).provideLinks(
                {
                    uri: projectSourceUri(monaco, {
                        sessionId: x86SessionId,
                        sourceKind: 'live',
                        path: 'main.asm'
                    }),
                    getLineCount: () => 1,
                    getLineContent: () => 'blob: incbin "blob"'
                } as never,
                {} as never
            )
            expect(links?.links[0]?.range).toEqual(
                expect.objectContaining({ startColumn: 15, endColumn: 19 })
            )
        } finally {
            unregisterX86()
        }
    })

    it('links and completes an include file of the include path, which the editor shows read-only', async () => {
        const content = '%include "linux/fb.inc"\n%include "missing.inc"'
        const x86Sources = normalizeBuildInput({
            entry: 'main.asm',
            files: { 'main.asm': { encoding: 'plain', content } }
        })
        const x86SessionId = 'x86-include-path-test'
        const unregisterX86 = registerLanguageSession({
            sessionId: x86SessionId,
            sources: x86Sources,
            snapshot: undefined,
            sourcesFor: () => x86Sources
        })
        const x86Options = {
            comment: ';' as const,
            dialect: 'x86' as const,
            systemIncludes: x86SystemIncludes
        }
        const lines = content.split('\n')
        const x86Model = (prefix?: string) => ({
            uri: projectSourceUri(monaco, {
                sessionId: x86SessionId,
                sourceKind: 'live',
                path: 'main.asm'
            }),
            getLineCount: () => lines.length,
            getLineContent: (line: number) => lines[line - 1] ?? '',
            getValueInRange: () => prefix ?? '',
            getWordUntilPosition: () => ({ word: '', startColumn: 1, endColumn: 1 })
        })
        try {
            const links = await createProjectDocumentLinkProvider(monaco, x86Options).provideLinks(
                x86Model() as never,
                {} as never
            )
            expect(links?.links).toEqual([
                expect.objectContaining({
                    url: expect.objectContaining({ path: '/live/@runtime/include/linux/fb.inc' }),
                    tooltip: 'Open @runtime/include/linux/fb.inc'
                })
            ])

            const complete = (prefix: string) =>
                createProjectSymbolCompletionProvider(monaco, x86Options).provideCompletionItems(
                    x86Model(prefix) as never,
                    { lineNumber: 1, column: prefix.length + 1 } as never,
                    {} as never,
                    {} as never
                )
            const suggestions = (await complete('%include "linux/f'))?.suggestions ?? []
            expect(suggestions).toContainEqual(
                expect.objectContaining({ label: 'linux/fb.inc', insertText: 'linux/fb.inc' })
            )
            expect(suggestions.every((item) => String(item.label).startsWith('linux/f'))).toBe(true)
            //an incbin's bytes are no include file
            expect((await complete('incbin "linux/f'))?.suggestions).toEqual([])
        } finally {
            unregisterX86()
        }
    })

    it('indexes sections, constants, macros, data and labels and hovers unique symbols', async () => {
        const symbols = await createProjectDocumentSymbolProvider(
            monaco,
            options
        ).provideDocumentSymbols(model('src/main.s') as never, {} as never)
        expect(symbols?.map((symbol) => [symbol.name, symbol.detail])).toEqual(
            expect.arrayContaining([
                ['.text', 'section'],
                ['SIZE', 'constant'],
                ['twice', 'macro'],
                ['main', 'label']
            ])
        )
        const hover = await createProjectSymbolHoverProvider(monaco, options).provideHover(
            {
                ...model('src/main.s'),
                getLineContent: () => 'SIZE'
            } as never,
            { lineNumber: 1, column: 2 } as never,
            {} as never
        )
        expect(hover?.contents[0]).toEqual(
            expect.objectContaining({ value: expect.stringContaining('constant') })
        )
    })

    it('finds no symbol in a comment, a label of the same name or not', async () => {
        const line = 'j main # back to main'
        const currentModel = { ...model('src/main.s'), getLineContent: () => line } as never
        const at = async (from: string, offset: number) => {
            const position = { lineNumber: 1, column: line.indexOf(from) + offset + 1 } as never
            return {
                hover: await createProjectSymbolHoverProvider(monaco, options).provideHover(
                    currentModel,
                    position,
                    {} as never
                ),
                definition: await createProjectDefinitionProvider(
                    monaco,
                    options
                ).provideDefinition(currentModel, position, {} as never)
            }
        }
        expect(await at('main', 1)).toEqual({
            hover: expect.objectContaining({ contents: expect.anything() }),
            definition: expect.objectContaining({ range: expect.anything() })
        })
        expect(await at('to main', 4)).toEqual({ hover: null, definition: null })
    })

    it.each([
        {
            dialect: 'mars' as const,
            comment: '#' as const,
            content: '.eqv e 5\n.macro ac\n.end_macro',
            expected: [
                ['e', 6],
                ['ac', 8]
            ]
        },
        {
            dialect: 'x86' as const,
            comment: ';' as const,
            content: '%define e 1\n%macro ac 0\n%endmacro\nstruc s\nendstruc\nsection s',
            expected: [
                ['e', 9],
                ['ac', 8],
                ['s', 7],
                ['s', 9]
            ]
        },
        {
            dialect: 'z80' as const,
            comment: ';' as const,
            content: 'macro a\nendm\nm macro\nendm',
            expected: [
                ['a', 7],
                ['m', 1]
            ]
        }
    ])(
        'places a $dialect directive symbol at its name, not inside the keyword',
        async (dialect) => {
            const dialectSessionId = `${dialect.dialect}-symbol-range-test`
            const dialectSources = normalizeBuildInput({
                entry: 'main.asm',
                files: { 'main.asm': { encoding: 'plain', content: dialect.content } }
            })
            const unregisterDialect = registerLanguageSession({
                sessionId: dialectSessionId,
                sources: dialectSources,
                snapshot: undefined,
                sourcesFor: () => dialectSources
            })
            try {
                const symbols = await createProjectDocumentSymbolProvider(
                    monaco,
                    dialect
                ).provideDocumentSymbols(
                    {
                        uri: projectSourceUri(monaco, {
                            sessionId: dialectSessionId,
                            sourceKind: 'live',
                            path: 'main.asm'
                        })
                    } as never,
                    {} as never
                )
                expect(
                    symbols
                        ?.filter((symbol) => symbol.detail !== 'label')
                        .map((symbol) => [symbol.name, symbol.range.startColumn])
                ).toEqual(dialect.expected)
            } finally {
                unregisterDialect()
            }
        }
    )

    it('completes labels across one include unit without leaking unrelated Project Files', async () => {
        const complete = async (path: string, prefix: string) => {
            const word = /[A-Za-z_@$.?][\w@$.?]*$/.exec(prefix)?.[0] ?? ''
            return createProjectSymbolCompletionProvider(monaco, options).provideCompletionItems(
                {
                    ...model(path),
                    getValueInRange: () => prefix,
                    getWordUntilPosition: () => ({
                        word,
                        startColumn: prefix.length - word.length + 1,
                        endColumn: prefix.length + 1
                    })
                } as never,
                { lineNumber: 1, column: prefix.length + 1 } as never,
                {} as never,
                {} as never
            )
        }

        const fromEntry = await complete('src/main.s', '    j da')
        expect(fromEntry?.suggestions).toContainEqual(expect.objectContaining({ label: 'data' }))
        expect(fromEntry?.suggestions).not.toContainEqual(
            expect.objectContaining({ label: 'hidden' })
        )

        const fromIncludedFile = await complete('lib/util.s', '    j mai')
        expect(fromIncludedFile?.suggestions).toContainEqual(
            expect.objectContaining({ label: 'main' })
        )

        const fromUnrelatedFile = await complete('other.s', '    j da')
        expect(fromUnrelatedFile?.suggestions).not.toContainEqual(
            expect.objectContaining({ label: 'data' })
        )
    })

    it.each([
        { dialect: 'z80' as const, comment: ';' as const, include: '#include "lib.asm"' },
        { dialect: 'x86' as const, comment: ';' as const, include: '%include "lib.asm"' }
    ])('follows $dialect include scope for cross-File completion', async (dialect) => {
        const dialectSessionId = `${dialect.dialect}-completion-scope-test`
        const dialectSources = normalizeBuildInput({
            entry: 'main.asm',
            files: {
                'main.asm': {
                    encoding: 'plain',
                    content: `start: nop\n${dialect.include}`
                },
                'lib.asm': { encoding: 'plain', content: 'target: nop' },
                'unrelated.asm': { encoding: 'plain', content: 'hidden: nop' }
            }
        })
        const unregisterDialect = registerLanguageSession({
            sessionId: dialectSessionId,
            sources: dialectSources,
            snapshot: undefined,
            sourcesFor: () => dialectSources
        })
        try {
            const prefix = '    jp tar'
            const result = await createProjectSymbolCompletionProvider(
                monaco,
                dialect
            ).provideCompletionItems(
                {
                    uri: projectSourceUri(monaco, {
                        sessionId: dialectSessionId,
                        sourceKind: 'live',
                        path: 'main.asm'
                    }),
                    getValueInRange: () => prefix,
                    getWordUntilPosition: () => ({
                        word: 'tar',
                        startColumn: prefix.length - 2,
                        endColumn: prefix.length + 1
                    })
                } as never,
                { lineNumber: 1, column: prefix.length + 1 } as never,
                {} as never,
                {} as never
            )
            expect(result?.suggestions).toContainEqual(expect.objectContaining({ label: 'target' }))
            expect(result?.suggestions).not.toContainEqual(
                expect.objectContaining({ label: 'hidden' })
            )
        } finally {
            unregisterDialect()
        }
    })

    it('reads a File for its symbols once, and again only once it has changed', async () => {
        const cachedSessionId = 'project-symbols-cache-test'
        let current = normalizeBuildInput({
            entry: 'main.s',
            files: {
                'main.s': { encoding: 'plain', content: 'main: nop\n.include "util.s"' },
                'util.s': { encoding: 'plain', content: 'helper: nop' },
                'other.s': { encoding: 'plain', content: 'other: nop' }
            }
        })
        const unregisterCached = registerLanguageSession({
            sessionId: cachedSessionId,
            sources: current,
            snapshot: undefined,
            sourcesFor: () => current
        })
        const at = (path: string, prefix = '    j h') =>
            ({
                uri: projectSourceUri(monaco, {
                    sessionId: cachedSessionId,
                    sourceKind: 'live',
                    path
                }),
                getValueInRange: () => prefix,
                getWordUntilPosition: () => ({ word: 'h', startColumn: 6, endColumn: 7 })
            }) as never
        const complete = (path: string) =>
            createProjectSymbolCompletionProvider(monaco, options).provideCompletionItems(
                at(path),
                { lineNumber: 1, column: 8 } as never,
                {} as never,
                {} as never
            )
        const documentSymbols = (path: string) =>
            createProjectDocumentSymbolProvider(monaco, options).provideDocumentSymbols(
                at(path),
                {} as never
            )
        const split = vi.spyOn(String.prototype, 'split')
        /** How many times the text of the File at `path` was split into lines since `from`. */
        const reads = (path: string, from = 0) =>
            split.mock.contexts
                .slice(from)
                .filter((text) => String(text) === current.files[path].content).length
        try {
            expect((await complete('main.s'))?.suggestions).toContainEqual(
                expect.objectContaining({ label: 'helper' })
            )
            expect(reads('main.s')).toBeGreaterThan(0)
            expect(reads('other.s')).toBe(0)
            let mark = split.mock.contexts.length
            await complete('main.s')
            await documentSymbols('main.s')
            await complete('util.s')
            expect(reads('main.s', mark) + reads('util.s', mark)).toBe(0)
            //document symbols read their own File alone, once
            await documentSymbols('other.s')
            await documentSymbols('other.s')
            expect(reads('other.s', mark)).toBe(1)
            //a change to one File reads that File again, and none of the others
            current = normalizeBuildInput({
                ...current,
                files: cleanFiles({ ...current.files, 'util.s': textFile('helper2: nop') })
            })
            mark = split.mock.contexts.length
            expect((await complete('main.s'))?.suggestions).toContainEqual(
                expect.objectContaining({ label: 'helper2' })
            )
            expect(reads('util.s', mark)).toBeGreaterThan(0)
            expect(reads('main.s', mark)).toBe(0)
        } finally {
            split.mockRestore()
            unregisterCached()
        }
    })
})
