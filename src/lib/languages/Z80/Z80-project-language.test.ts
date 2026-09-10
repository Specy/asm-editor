import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MonacoType } from '$lib/monaco/Monaco'
import { normalizeBuildInput } from '$lib/projectFiles'
import { analyzeZ80Project } from '$lib/languages/service/adapters/z80Adapter'
import { registerLanguageSession } from '$lib/languages/service/sessionRegistry'
import { projectSourceUri } from '$lib/languages/service/uri'
import {
    createZ80ProjectDocumentSymbolProvider,
    createZ80ProjectDefinitionProvider,
    createZ80ReferenceProvider,
    createZ80RenameProvider
} from './Z80-project-language'

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
    Uri: { from: (parts: { scheme: string; authority: string; path: string }) => parts },
    languages: {
        SymbolKind: { Constant: 1, Field: 2, Function: 3, Method: 4, Namespace: 5 },
        DocumentHighlightKind: { Read: 1, Write: 2 }
    }
} as unknown as MonacoType

const sessionId = 'z80-provider-test'
const sources = normalizeBuildInput({
    entry: 'main.asm',
    files: {
        'main.asm': { encoding: 'plain', content: 'start: jp target\n#include "lib.asm"' },
        'lib.asm': { encoding: 'plain', content: 'target: nop' },
        'notes.asm': {
            encoding: 'plain',
            content: 'helper macro\nendm\n#code\nloop:\nld a, b'
        }
    }
})
const snapshot = analyzeZ80Project(sources, sessionId, 1)
let unregister: () => void

function model(path: string) {
    const content = sources.files[path]?.content ?? ''
    const lines = content.split('\n')
    return {
        uri: projectSourceUri(monacoStub, { sessionId, sourceKind: 'live', path }),
        getLineCount: () => lines.length,
        getLineContent: (line = 1) => lines[line - 1] ?? '',
        getValueInRange: () => content,
        getWordUntilPosition: () => ({ word: 'target', startColumn: 11, endColumn: 17 })
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

describe('Z80 authoritative Project providers', () => {
    it('keeps a useful outline for macros, sections and labels in an unreachable File', async () => {
        const symbols = await createZ80ProjectDocumentSymbolProvider(
            monacoStub
        ).provideDocumentSymbols(model('notes.asm') as never, {} as never)
        expect(symbols?.map((symbol) => symbol.name)).toEqual(
            expect.arrayContaining(['helper', '#code', 'loop'])
        )
        expect(symbols?.map((symbol) => symbol.name)).not.toContain('ld')
    })

    it('resolves definitions and references through the Core symbol identity', async () => {
        const definition = await createZ80ProjectDefinitionProvider(monacoStub).provideDefinition(
            model('main.asm') as never,
            { lineNumber: 1, column: 12 } as never,
            {} as never
        )
        expect(definition).toEqual([
            expect.objectContaining({ uri: expect.objectContaining({ path: '/live/lib.asm' }) })
        ])

        const references = await createZ80ReferenceProvider(monacoStub).provideReferences(
            model('main.asm') as never,
            { lineNumber: 1, column: 12 } as never,
            { includeDeclaration: true } as never,
            {} as never
        )
        expect(references).toHaveLength(2)
        expect(references).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    uri: expect.objectContaining({ path: '/live/main.asm' })
                }),
                expect.objectContaining({ uri: expect.objectContaining({ path: '/live/lib.asm' }) })
            ])
        )
    })

    it('returns a multi-File rename and rejects reserved names', async () => {
        const provider = createZ80RenameProvider(monacoStub)
        const edit = await provider.provideRenameEdits(
            model('main.asm') as never,
            { lineNumber: 1, column: 12 } as never,
            'destination',
            {} as never
        )
        expect(edit).toEqual(expect.objectContaining({ edits: expect.any(Array) }))
        expect(edit && 'edits' in edit ? edit.edits : []).toHaveLength(2)

        const rejected = await provider.provideRenameEdits(
            model('main.asm') as never,
            { lineNumber: 1, column: 12 } as never,
            'ld',
            {} as never
        )
        expect(rejected).toEqual(expect.objectContaining({ rejectReason: expect.any(String) }))
    })
})
