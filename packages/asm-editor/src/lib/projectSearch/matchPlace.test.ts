/**
 * Finding a Search panel row's match again in the text a pane shows
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decision 26).
 */
import { describe, expect, it } from 'vite-plus/test'
import { findMatchAgain, matchedText } from './matchPlace'
import type { SearchRow } from './searchText'

describe('matchedText', () => {
    it("is the match's text on its row, as far as its line goes", () => {
        const row: SearchRow = {
            line: 3,
            text: 'iVar1 = strcmp(acStack_98,"hunter2");',
            textStart: 0,
            ranges: [{ start: 27, end: 34 }]
        }
        expect(matchedText(row, row.ranges[0])).toBe('hunter2')
        expect(matchedText(row, { start: 8, end: 37, endLine: 4, endColumn: 2 })).toBe(
            'strcmp(acStack_98,"hunter2");'
        )
        //a cut line's row starts later in the line than the line does
        expect(matchedText({ ...row, textStart: 100 }, { start: 127, end: 134 })).toBe('hunter2')
        expect(matchedText(row, { start: 5, end: 5 })).toBe('')
    })
})

describe('findMatchAgain', () => {
    const text = '// main, 0x11e9 to 0x1290\n\nint main(void)\n{\n  puts("hunter2");\n}\n'

    it('keeps a match that is still where it was', () => {
        expect(findMatchAgain(text, 4, 8, 'hunter2')).toEqual({ line: 4, column: 8, found: true })
    })

    it('finds it on the nearest line holding it, the nearest occurrence on that line', () => {
        //searched in the decompiler's text, without the pane's two-line header
        expect(findMatchAgain(text, 2, 8, 'hunter2')).toEqual({ line: 4, column: 8, found: true })
        expect(findMatchAgain('a b a b a\nx', 0, 7, 'a')).toEqual({
            line: 0,
            column: 8,
            found: true
        })
        //the line below wins a tie
        expect(findMatchAgain('x\ny\nx', 1, 0, 'x')).toEqual({ line: 2, column: 0, found: true })
        //lines end at \r\n and a lone \r too
        expect(findMatchAgain('a\r\nb\rhunter2', 0, 0, 'hunter2')).toEqual({
            line: 2,
            column: 0,
            found: true
        })
    })

    it('keeps the line, within the text, for a match that is gone', () => {
        expect(findMatchAgain(text, 4, 8, 'hunter3')).toEqual({ line: 4, column: 0, found: false })
        expect(findMatchAgain(text, 40, 0, 'hunter3')).toEqual({
            line: 6,
            column: 0,
            found: false
        })
        //a zero-length match is found where it was
        expect(findMatchAgain(text, 2, 3, '')).toEqual({ line: 2, column: 3, found: true })
    })
})
