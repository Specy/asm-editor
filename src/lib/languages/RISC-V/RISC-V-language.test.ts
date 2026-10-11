import { describe, expect, it } from 'vitest'
import type monaco from 'monaco-editor'
import type { MonacoType } from '#lib/monaco/Monaco.ts'
import { RISCVLanguageConfiguration } from './RISC-V-grammar'
import { createRISCVCompletion, createRISCVHoverProvider } from './RISC-V-language'

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
    languages: {
        CompletionItemKind: { Keyword: 17, Function: 1, Snippet: 27, Variable: 4, Constant: 14 },
        CompletionItemInsertTextRule: { InsertAsSnippet: 4 }
    }
} as unknown as MonacoType

/** The word Monaco reports: the pattern match that touches the column, as its wordHelper picks it. */
function wordAt(line: string, column: number) {
    const pattern = new RegExp(RISCVLanguageConfiguration.wordPattern!.source, 'g')
    for (const match of line.matchAll(pattern)) {
        const start = match.index
        const end = start + match[0].length
        if (start <= column - 1 && column - 1 <= end) {
            return { word: match[0], startColumn: start + 1, endColumn: end + 1 }
        }
    }
    return null
}

function model(line: string) {
    return {
        uri: undefined,
        getValue: () => line,
        getLineContent: () => line,
        getValueInRange: (range: { endColumn: number }) => line.slice(0, range.endColumn - 1),
        getWordAtPosition: (position: monaco.Position) => wordAt(line, position.column),
        getWordUntilPosition: (position: monaco.Position) => {
            const word = wordAt(line, position.column)
            if (!word) return { word: '', startColumn: position.column, endColumn: position.column }
            return {
                word: word.word.slice(0, position.column - word.startColumn),
                startColumn: word.startColumn,
                endColumn: position.column
            }
        }
    } as unknown as monaco.editor.ITextModel
}

async function hover(line: string, at: string, offset = 0) {
    const result = await createRISCVHoverProvider(monacoStub).provideHover(
        model(line),
        { lineNumber: 1, column: line.indexOf(at) + offset + 1 } as monaco.Position,
        {} as monaco.CancellationToken
    )
    return result ? result.contents.map((content) => content.value).join('\n') : ''
}

describe('RISC-V hovers', () => {
    it('documents the whole dotted mnemonic wherever the pointer rests on it', async () => {
        const line = 'fcvt.w.s a0, fa0'
        expect(await hover(line, 'fcvt')).toMatch(/^\*\*fcvt\.w\.s\*\*/)
        expect(await hover(line, 's a0')).toMatch(/^\*\*fcvt\.w\.s\*\*/)
        expect(await hover('fadd.d fa0, fa1, fa2', 'd fa0')).toMatch(/^\*\*fadd\.d\*\*/)
        expect(await hover('lr.w t0, (a0)', 'lr')).toMatch(/^\*\*lr\.w\*\*/)
    })

    it('still finds directives without their dot', async () => {
        expect(await hover('    .text', 'text')).not.toBe('')
    })
})

describe('RISC-V completion', () => {
    it('replaces the typed dotted prefix rather than appending after the dot', async () => {
        const line = 'fadd.'
        const result = await createRISCVCompletion(monacoStub).provideCompletionItems(
            model(line),
            { lineNumber: 1, column: line.length + 1 } as monaco.Position,
            {} as monaco.languages.CompletionContext,
            {} as monaco.CancellationToken
        )
        const faddS = result?.suggestions.find((item) => item.label === 'fadd.s')
        expect(faddS?.range).toEqual(new Range(1, 1, 1, 6))
    })
})
