import { describe, expect, it, onTestFinished, vi } from 'vite-plus/test'
import type monaco from 'monaco-editor'
import type { MonacoType } from '#lib/monaco/Monaco.ts'
import { MIPSLanguageConfiguration } from './MIPS-grammar'
import { createMIPSCompletion, createMIPSHoverProvider } from './MIPS-language'

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
    const pattern = new RegExp(MIPSLanguageConfiguration.wordPattern!.source, 'g')
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
    const result = await createMIPSHoverProvider(monacoStub).provideHover(
        model(line),
        { lineNumber: 1, column: line.indexOf(at) + offset + 1 } as monaco.Position,
        {} as monaco.CancellationToken
    )
    return result ? result.contents.map((content) => content.value).join('\n') : ''
}

describe('MIPS hovers', () => {
    it("links the instruction's Documentation by the page's address", async () => {
        //Monaco renders a link without a scheme as plain text, so a hover's are absolute
        vi.stubGlobal('location', { origin: 'https://asm.example' })
        onTestFinished(() => void vi.unstubAllGlobals())
        expect(await hover('add $t0, $t1, $t2', 'add')).toContain(
            '[Documentation](https://asm.example/documentation/mips/instruction/add)'
        )
    })

    it('documents the whole dotted mnemonic wherever the pointer rests on it', async () => {
        const line = 'abs.d $f0, $f2'
        expect(await hover(line, 'abs')).toMatch(/^\*\*abs\.d\*\*/)
        expect(await hover(line, 'd $f0')).toMatch(/^\*\*abs\.d\*\*/)
        expect(await hover('l.d $f0, 0($t0)', 'l.d')).toMatch(/^\*\*l\.d\*\*/)
        expect(await hover('c.eq.s $f0, $f2', 'eq')).toMatch(/^\*\*c\.eq\.s\*\*/)
    })

    it('still finds directives without their dot and registers without their dollar', async () => {
        expect(await hover('    .data', 'data')).not.toBe('')
        expect(await hover('lw $t0, 4($sp)', 't0')).toContain('t0')
    })

    it('names the tags every form has right under the name, and no category', async () => {
        const li = await hover('li $t0, 5', 'li')
        expect(li).toMatch(/^\*\*li\*\*/)
        expect(li.split('\n\n')[1]).toBe('*Pseudo-instruction*')
        // `add $t1, $t2, -100` is a pseudo-instruction, but `add $t1, $t2, $t3` is not: the tag
        // goes on the row of the pseudo form, never on the line under the name.
        const add = await hover('add $t0, $t1, $t2', 'add')
        expect(add.split('\n\n')[1]).not.toMatch(/^\*/)
        expect(add).toContain('| `add $t1, $t2, $t3` |  |\n')
        expect(add).toContain('| `add $t1, $t2, imm` | Pseudo-instruction |')
    })

    it('says nothing about the words of a comment, a label of the same name or not', async () => {
        const line = 'main: j main # add one, then back to main'
        expect(await hover(line, 'j main', 2)).toContain('Label **main**')
        expect(await hover(line, 'to main', 3)).toBe('')
        expect(await hover(line, 'add')).toBe('')
        expect(await hover(line, '#')).toBe('')
    })
})

describe('MIPS completion', () => {
    it('replaces the typed dotted prefix rather than appending after the dot', async () => {
        const line = 'abs.'
        const result = await createMIPSCompletion(monacoStub).provideCompletionItems(
            model(line),
            { lineNumber: 1, column: line.length + 1 } as monaco.Position,
            {} as monaco.languages.CompletionContext,
            {} as monaco.CancellationToken
        )
        const absD = result?.suggestions.find((item) => item.label === 'abs.d')
        expect(absD?.range).toEqual(new Range(1, 1, 1, 5))
    })
})
