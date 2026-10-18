import { describe, expect, it } from 'vite-plus/test'
import type monaco from 'monaco-editor'
import type { MonacoType } from '#lib/monaco/Monaco.ts'
import { Z80LanguageConfiguration } from './Z80-grammar'
import { createZ80HoverProvider } from './Z80-language'

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
    const pattern = new RegExp(Z80LanguageConfiguration.wordPattern!.source, 'g')
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
async function hover(line: string, at: string, offset = 0) {
    const result = await createZ80HoverProvider(monacoStub).provideHover(
        model(line),
        { lineNumber: 1, column: line.indexOf(at) + offset + 1 } as monaco.Position,
        {} as monaco.CancellationToken
    )
    return result ? result.contents.map((content) => content.value) : []
}

/** The block naming the tags of the exact form the line uses, when there is one. */
async function formLine(line: string, at: string) {
    return (await hover(line, at)).find((block) => block.startsWith('*This form:'))
}

describe('Z80 hovers', () => {
    it('names the category and the tags every form has, right under the name', async () => {
        const [heading] = await hover('    add a,c', 'add')
        expect(heading).toMatch(/^\*\*add\*\*/)
        expect(heading.split('\n\n')[1]).toBe('*Arithmetic*')
        // Every form of `sll` is one Zilog's manual leaves out.
        const [sll] = await hover('    sll b', 'sll')
        expect(sll.split('\n\n')[1]).toBe('*Shifts and rotates · Undocumented*')
    })

    it('tags a pseudo spelling, though it shares its table row with the real form', async () => {
        expect(await formLine('    add c', 'add')).toBe('*This form: Pseudo-instruction*')
        expect(await formLine('    add a,c', 'add')).toBeUndefined()
        expect((await hover('    add a,c', 'add')).join('\n')).not.toContain('Pseudo-instruction')
    })

    it('tags a combination as a pseudo-instruction and not as undocumented', async () => {
        expect(await formLine('    ld hl,bc', 'ld')).toBe('*This form: Pseudo-instruction*')
    })

    it('gives a pseudo spelling of an undocumented opcode both tags', async () => {
        expect(await formLine('    add ixh', 'add')).toBe(
            '*This form: Pseudo-instruction · Undocumented*'
        )
    })

    it('puts the form between the heading and the table', async () => {
        const blocks = await hover('loop: add c ; comment', 'add')
        expect(blocks).toHaveLength(3)
        expect(blocks[0]).toMatch(/^\*\*add\*\*/)
        expect(blocks[1]).toBe('*This form: Pseudo-instruction*')
        expect(blocks[2]).toMatch(/^Adds .+\n\nFlags: S ● · .+\n\n`add a, r` · /)
    })

    it('reads an expression at the end of the line as finished', async () => {
        expect(await formLine('    ld ixh,2', 'ld')).toBe('*This form: Undocumented*')
        expect(await formLine('    ld ixh,count+2', 'ld')).toBe('*This form: Undocumented*')
    })

    it('says nothing about a form off the mnemonic or on an incomplete line', async () => {
        expect(await formLine('    add', 'add')).toBeUndefined()
        expect(await formLine('    add c,', 'add')).toBeUndefined()
        // A label spelled like a mnemonic is not the instruction.
        expect(await formLine('add: add c', 'add')).toBeUndefined()
        expect(await formLine('    add c', 'c')).toBeUndefined()
    })
})
