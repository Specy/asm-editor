import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MonacoType } from '$lib/monaco/Monaco'
import { normalizeBuildInput } from '$lib/projectFiles'
import { registerLanguageSession } from './sessionRegistry'
import { projectSourceUri } from './uri'
import {
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
        'lib/util.s': { encoding: 'plain', content: 'data: .word 1' }
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
})
