import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MonacoType } from '$lib/monaco/Monaco'
import { normalizeBuildInput } from '$lib/projectFiles'
import { registerLanguageSession } from '$lib/languages/service/sessionRegistry'
import { analyzeM68kProject } from '$lib/languages/service/adapters/m68kAdapter'
import { projectSourceUri } from '$lib/languages/service/uri'
import {
    createM68kDefinitionProvider,
    createM68kDocumentLinkProvider,
    createM68kDocumentSymbolProvider,
    createM68kProjectCompletionProvider
} from './M68K-project-language'

class Range {
    constructor(
        readonly startLineNumber: number,
        readonly startColumn: number,
        readonly endLineNumber: number,
        readonly endColumn: number
    ) {}
}

const monacoStub = {
    Range,
    Uri: {
        from: (parts: { scheme: string; authority: string; path: string }) => parts
    },
    languages: {
        CompletionItemKind: {
            Constant: 1,
            Variable: 2,
            Value: 3,
            Reference: 4,
            File: 5
        },
        SymbolKind: {
            Constant: 1,
            Variable: 2,
            Array: 3,
            Field: 4,
            Function: 5
        }
    }
} as unknown as MonacoType

const sources = normalizeBuildInput({
    entry: 'a.m68k',
    files: {
        'a.m68k': { encoding: 'plain', content: '    include "lib/b.m68k"\n    simhalt' },
        'lib/b.m68k': { encoding: 'plain', content: 'target: dc.w 1' },
        'c.m68k': { encoding: 'plain', content: 'unused: move.w target,d0' }
    }
})
const sessionId = 'provider-test'
const snapshot = analyzeM68kProject(sources, sessionId, 1)
let unregister: () => void

function model(path: string, text: string, buildGeneration?: number) {
    const lines = text.split('\n')
    return {
        uri: projectSourceUri(
            monacoStub,
            buildGeneration === undefined
                ? { sessionId, sourceKind: 'live', path }
                : { sessionId, sourceKind: 'build', buildGeneration, path }
        ),
        getValue: () => text,
        getLineCount: () => lines.length,
        getLineContent: (lineNumber: number) => lines[lineNumber - 1] ?? '',
        getValueInRange: (range: { startLineNumber: number; endColumn: number }) =>
            (lines[range.startLineNumber - 1] ?? '').slice(0, range.endColumn - 1),
        getWordUntilPosition: (position: { lineNumber: number; column: number }) => {
            const prefix = (lines[position.lineNumber - 1] ?? '').slice(0, position.column - 1)
            const word = /[A-Za-z0-9_.$]+$/.exec(prefix)?.[0] ?? ''
            return {
                word,
                startColumn: position.column - word.length,
                endColumn: position.column
            }
        }
    }
}

beforeEach(() => {
    unregister = registerLanguageSession({
        sessionId,
        sources,
        snapshot,
        sourcesFor: () => sources
    })
})

afterEach(() => unregister())

describe('M68K Project providers', () => {
    it('offers labels across an include unit but not inside an unrelated secondary File', async () => {
        const entryText = '    bra tar'
        const entryResult = await createM68kProjectCompletionProvider(
            monacoStub
        ).provideCompletionItems(
            model('a.m68k', entryText) as never,
            { lineNumber: 1, column: entryText.length + 1 } as never,
            {} as never,
            {} as never
        )
        expect(entryResult?.suggestions).toContainEqual(
            expect.objectContaining({ label: 'target', insertText: 'target' })
        )

        const text = sources.files['c.m68k'].content
        const result = await createM68kProjectCompletionProvider(monacoStub).provideCompletionItems(
            model('c.m68k', text) as never,
            { lineNumber: 1, column: text.indexOf('target') + 4 } as never,
            {} as never,
            {} as never
        )
        expect(result?.suggestions).not.toContainEqual(
            expect.objectContaining({ label: 'target', insertText: 'target' })
        )
    })

    it('publishes document symbols and resolves a cross-File definition', async () => {
        const text = sources.files['c.m68k'].content
        const currentModel = model('c.m68k', text)
        const symbols = await createM68kDocumentSymbolProvider(monacoStub).provideDocumentSymbols(
            currentModel as never,
            {} as never
        )
        expect(symbols).toContainEqual(expect.objectContaining({ name: 'unused' }))

        const definition = await createM68kDefinitionProvider(monacoStub).provideDefinition(
            currentModel as never,
            { lineNumber: 1, column: text.indexOf('target') + 2 } as never,
            {} as never
        )
        expect(definition).toEqual(
            expect.objectContaining({
                uri: expect.objectContaining({ path: '/live/lib/b.m68k' }),
                range: expect.objectContaining({ startLineNumber: 1, startColumn: 1, endColumn: 7 })
            })
        )
    })

    /**
     * A Build switches the editor to the snapshot view, and only the live Files are analysed. While
     * a File still reads the way the analysis read it — which, right after a Build, is always —
     * navigation has to keep working there rather than silently going dead.
     */
    it('resolves a definition in the Build snapshot view', async () => {
        const text = sources.files['c.m68k'].content
        const definition = await createM68kDefinitionProvider(monacoStub).provideDefinition(
            model('c.m68k', text, 3) as never,
            { lineNumber: 1, column: text.indexOf('target') + 2 } as never,
            {} as never
        )
        expect(definition).toEqual(
            expect.objectContaining({
                uri: expect.objectContaining({ path: '/build-3/lib/b.m68k' })
            })
        )
    })

    it('drops symbols from a File the program changed after the Build', async () => {
        const changed = normalizeBuildInput({
            entry: sources.entry,
            files: {
                ...sources.files,
                'lib/b.m68k': { encoding: 'plain', content: 'other: dc.w 2' }
            }
        })
        const scoped = registerLanguageSession({
            sessionId: 'changed-since-build',
            sources: changed,
            snapshot: analyzeM68kProject(changed, 'changed-since-build', 1),
            //the Build snapshot still holds the original text of every File
            sourcesFor: (sourceKind) => (sourceKind === 'live' ? changed : sources)
        })
        const text = sources.files['c.m68k'].content
        const definition = await createM68kDefinitionProvider(monacoStub).provideDefinition(
            {
                ...model('c.m68k', text, 1),
                uri: projectSourceUri(monacoStub, {
                    sessionId: 'changed-since-build',
                    sourceKind: 'build',
                    buildGeneration: 1,
                    path: 'c.m68k'
                })
            } as never,
            { lineNumber: 1, column: text.indexOf('target') + 2 } as never,
            {} as never
        )
        //`lib/b.m68k` no longer reads the way the analysis read it, so its ranges are not offered
        expect(definition).toBeNull()
        scoped()
    })

    it('completes and links include paths using Project resolution rules', async () => {
        const completionText = '    include "li'
        const completions = await createM68kProjectCompletionProvider(
            monacoStub
        ).provideCompletionItems(
            model('a.m68k', completionText) as never,
            { lineNumber: 1, column: completionText.length + 1 } as never,
            {} as never,
            {} as never
        )
        expect(completions?.suggestions).toContainEqual(
            expect.objectContaining({ label: 'lib/b.m68k', insertText: 'lib/b.m68k' })
        )

        const links = await createM68kDocumentLinkProvider(monacoStub).provideLinks(
            model('a.m68k', sources.files['a.m68k'].content) as never,
            {} as never
        )
        expect(links?.links).toContainEqual(
            expect.objectContaining({ url: expect.objectContaining({ path: '/live/lib/b.m68k' }) })
        )
    })
})
