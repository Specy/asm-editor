/**
 * An editor's place in a function's Pseudocode decompiled again
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decision
 * 22): lines found by what they stand for, a name's column by the name.
 */
import type { DecompiledLine, DecompiledToken } from '@specy/decompiler'
import type monaco from 'monaco-editor'
import { describe, expect, it } from 'vite-plus/test'
import {
    movedPseudocodeLine,
    movePseudocodeViewState,
    noteViewStatePseudocode,
    pseudocodeViewStateFor,
    type PseudocodeLines
} from './pseudocodeViewState'

type Word = string | [string, Partial<DecompiledToken>]

/** A decompiled line of words, one token each, separated by one space after `indent` spaces. */
function line(indent: number, ...words: Word[]): DecompiledLine {
    let text = ' '.repeat(indent)
    const tokens: DecompiledToken[] = []
    for (const word of words) {
        const [value, token] = typeof word === 'string' ? [word, {}] : word
        if (text.trim()) text += ' '
        tokens.push({
            start: text.length,
            end: text.length + value.length,
            kind: 'syntax',
            ...token
        })
        text += value
    }
    const addresses = [
        ...new Set(tokens.flatMap((token) => (token.address === undefined ? [] : [token.address])))
    ].sort((a, b) => a - b)
    return { text, tokens, addresses }
}

const comment = (address: number, words: string): Word => [
    words,
    { kind: 'comment', comment: 'user', address }
]
const local = (name: string, id: string, address?: number): Word => [
    name,
    { kind: 'variable', variable: id, ...(address === undefined ? {} : { address }) }
]

/** `int f(void) { int iVar1; iVar1 = g(); if (iVar1) { … } return iVar1; }`, under a 2-line header. */
function text({
    name = 'iVar1',
    commented = false
}: { name?: string; commented?: boolean } = {}): PseudocodeLines {
    const id = 'register:0x0:4@+0x8'
    return {
        firstLine: 2,
        lines: [
            line(0, 'int', ['f', { kind: 'function', target: 0x10 }], '(void)'),
            line(0, '{'),
            line(2, 'int', local(name, id), ';'),
            line(
                2,
                local(name, id, 0x18),
                '=',
                ['g', { kind: 'function', target: 0x40, address: 0x18 }],
                '();'
            ),
            ...(commented
                ? [line(2, comment(0x1c, '/* first')), line(2, comment(0x1c, 'second */'))]
                : []),
            line(2, 'if', '(', local(name, id, 0x1c), ')', '{'),
            line(4, ['h', { kind: 'function', target: 0x50, address: 0x20 }], '();'),
            line(2, '}'),
            line(2, 'return', local(name, id, 0x28), ';'),
            line(0, '}')
        ]
    }
}

function viewState(line: number, column: number): monaco.editor.ICodeEditorViewState {
    const position = { lineNumber: line + 1, column: column + 1 }
    return {
        cursorState: [{ inSelectionMode: false, selectionStart: position, position }],
        viewState: { scrollLeft: 0, firstPosition: position, firstPositionDeltaTop: 0 },
        contributionsState: {}
    }
}

const at = (state: monaco.editor.ICodeEditorViewState) => {
    const { position } = state.cursorState[0]
    return [position.lineNumber - 1, position.column - 1]
}

describe('movedPseudocodeLine', () => {
    const before = text()
    const after = text({ commented: true })

    it('finds a statement by its instructions past lines written above it', () => {
        //the `if` is document line 6, and below two comment lines in the other
        expect(movedPseudocodeLine(before, after, 6)).toBe(8)
        expect(movedPseudocodeLine(before, after, 5)).toBe(5)
        expect(movedPseudocodeLine(after, before, 8)).toBe(6)
    })

    it('moves a line of syntax alone with the nearest one standing for something', () => {
        //the `if`'s closing brace follows `h();`
        expect(movedPseudocodeLine(before, after, 8)).toBe(10)
        //the last brace has nothing after it, and goes with the `return` before it
        expect(movedPseudocodeLine(before, after, 10)).toBe(12)
    })

    it('finds a comment’s lines by their address, one after another', () => {
        expect(movedPseudocodeLine(after, after, 6)).toBe(6)
        const again = text({ commented: true, name: 'count' })
        expect(movedPseudocodeLine(after, again, 6)).toBe(6)
        expect(movedPseudocodeLine(after, again, 7)).toBe(7)
        //gone, the line moves with the statement after it
        expect(movedPseudocodeLine(after, before, 7)).toBe(6)
    })

    it('keeps the header, and a line found nowhere, at its number', () => {
        expect(movedPseudocodeLine(before, after, 0)).toBe(0)
        expect(movedPseudocodeLine(before, after, 1)).toBe(1)
        const other: PseudocodeLines = { firstLine: 2, lines: [line(0, '{'), line(0, '}')] }
        expect(movedPseudocodeLine(before, other, 6)).toBe(3)
    })
})

describe('movePseudocodeViewState', () => {
    it('keeps the cursor on a renamed name, as far into it as the name allows', () => {
        const before = text()
        const after = text({ name: 'ok', commented: true })
        //`  iVar1 = g ();`, a letter into iVar1, four letters in, past the end of `ok`, and on `=`
        expect(at(movePseudocodeViewState(viewState(5, 3), before, after))).toEqual([5, 3])
        expect(at(movePseudocodeViewState(viewState(5, 6), before, after))).toEqual([5, 4])
        expect(at(movePseudocodeViewState(viewState(5, 8), before, after))).toEqual([5, 5])
        //just after the name, after the new one
        expect(at(movePseudocodeViewState(viewState(5, 7), before, after))).toEqual([5, 4])
        //in the `if`, on `{`, two lines further down
        const branch = before.lines[4].text.indexOf('{')
        expect(at(movePseudocodeViewState(viewState(6, branch), before, after))).toEqual([
            8,
            after.lines[6].text.indexOf('{')
        ])
        //the indentation before the first word stays
        expect(at(movePseudocodeViewState(viewState(6, 1), before, after))).toEqual([8, 1])
        const moved = movePseudocodeViewState(viewState(6, 1), before, after)
        expect(moved.viewState.firstPosition.lineNumber).toBe(9)
    })

    it('is restored moved only onto another decompilation than the one it was saved over', () => {
        const before = text()
        const after = text({ commented: true })
        const state = viewState(6, 3)
        noteViewStatePseudocode(state, before)
        expect(pseudocodeViewStateFor(state, before)).toBe(state)
        expect(pseudocodeViewStateFor(state, { ...before })).toBe(state)
        expect(at(pseudocodeViewStateFor(state, after))).toEqual([8, 3])
        //one never noted, as a text File's, is restored as it is
        const plain = viewState(6, 3)
        expect(pseudocodeViewStateFor(plain, after)).toBe(plain)
    })
})
