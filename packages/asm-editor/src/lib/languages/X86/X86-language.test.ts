import { describe, expect, it } from 'vite-plus/test'
import type monaco from 'monaco-editor'
import type { MonacoType } from '#lib/monaco/Monaco.ts'
import { X86LanguageConfiguration } from './X86-grammar'
import { createX86HoverProvider } from './X86-language'

class Range {
    constructor(
        readonly startLineNumber: number,
        readonly startColumn: number,
        readonly endLineNumber: number,
        readonly endColumn: number
    ) {}
}

const monacoStub = { Range, languages: {} } as unknown as MonacoType

/** The word Monaco reports: the pattern match that touches the column, as its wordHelper picks it. */
function wordAt(line: string, column: number) {
    const pattern = new RegExp(X86LanguageConfiguration.wordPattern!.source, 'g')
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
        getWordAtPosition: (position: monaco.Position) => wordAt(line, position.column)
    } as unknown as monaco.editor.ITextModel
}

/** The hover's blocks, in order. */
async function hover(line: string, at: string) {
    const result = await createX86HoverProvider(monacoStub).provideHover(
        model(line),
        { lineNumber: 1, column: line.indexOf(at) + 1 } as monaco.Position,
        {} as monaco.CancellationToken
    )
    return result ? result.contents.map((content) => content.value) : []
}

describe('x86 hovers', () => {
    it('names the category and the tags every form has on the italic line', async () => {
        const [sysret] = await hover('    sysret', 'sysret')
        expect(sysret).toMatch(/^\*\*sysret\*\*/)
        expect(sysret.split('\n\n')[1]).toMatch(/^\*System · Privileged · .+ and later\*$/)
    })

    it('leaves a tag only some forms have off the line', async () => {
        // Eight of `mov`'s forms reach the control and debug registers, which are privileged.
        const [mov] = await hover('    mov rax, rbx', 'mov')
        expect(mov.split('\n\n')[1]).toMatch(/^\*Data movement · .+ and later\*$/)
        expect(mov).not.toContain('Privileged')
    })
})
