import { describe, expect, it } from 'vite-plus/test'
import { pseudocodeNameSpans, rewriteNames, type NamedLine } from './nameSpans'
import {
    compareDocuments,
    groupResults,
    searchDocumentId,
    searchTotals,
    type SearchDocumentInfo,
    type SearchDocumentResult
} from './searchResults'
import type { SearchRow } from './searchText'

const row = (line: number): SearchRow => ({ line, text: 'x', textStart: 0, ranges: [] })

function result(document: SearchDocumentInfo, matches: number, rows: number): SearchDocumentResult {
    return {
        id: searchDocumentId(document),
        document,
        matches,
        lines: matches,
        rows: Array.from({ length: rows }, (_, index) => row(index + 1))
    }
}

describe('documents', () => {
    it('have ids unique in a Project', () => {
        expect(searchDocumentId({ kind: 'file', path: 'src/main.c' })).toBe('file:src/main.c')
        expect(searchDocumentId({ kind: 'listing', path: 'crackme' })).toBe('listing:crackme')
        expect(
            searchDocumentId({
                kind: 'pseudocode',
                path: 'crackme',
                function: { address: 0x11e9, name: 'main' }
            })
        ).toBe('pseudocode:crackme@0x11e9')
    })

    it('come by path in any case, a Listing before its Pseudocode, functions by address', () => {
        const documents: SearchDocumentInfo[] = [
            { kind: 'pseudocode', path: 'crackme', function: { address: 0x20, name: 'b' } },
            { kind: 'file', path: 'Zeta.s' },
            { kind: 'pseudocode', path: 'crackme', function: { address: 0x10, name: 'z' } },
            { kind: 'file', path: 'alpha.s' },
            { kind: 'listing', path: 'crackme' },
            { kind: 'file', path: 'Alpha.s' }
        ]
        expect(
            [...documents].sort(compareDocuments).map((document) => searchDocumentId(document))
        ).toEqual([
            'file:Alpha.s',
            'file:alpha.s',
            'listing:crackme',
            'pseudocode:crackme@0x10',
            'pseudocode:crackme@0x20',
            'file:Zeta.s'
        ])
    })
})

describe('results', () => {
    const results = [
        result({ kind: 'file', path: 'a.s' }, 3, 3),
        result({ kind: 'listing', path: 'crackme' }, 5, 2),
        result(
            { kind: 'pseudocode', path: 'crackme', function: { address: 0x10, name: 'check' } },
            2,
            0
        ),
        result(
            { kind: 'pseudocode', path: 'crackme', function: { address: 0x20, name: 'main' } },
            4,
            0
        ),
        result(
            { kind: 'pseudocode', path: 'other', function: { address: 0x10, name: 'main' } },
            1,
            0
        ),
        result({ kind: 'file', path: 'z.s' }, 1, 0)
    ]

    it("are grouped by File, the Pseudocode's by Executable then function", () => {
        expect(
            groupResults(results).map((group) => ({
                kind: group.kind,
                path: group.path,
                matches: group.matches,
                lines: group.lines,
                rows: group.rows,
                functions: group.documents.map((document) => document.document.function?.name)
            }))
        ).toEqual([
            { kind: 'file', path: 'a.s', matches: 3, lines: 3, rows: 3, functions: [undefined] },
            {
                kind: 'listing',
                path: 'crackme',
                matches: 5,
                lines: 5,
                rows: 2,
                functions: [undefined]
            },
            {
                kind: 'pseudocode',
                path: 'crackme',
                matches: 6,
                lines: 6,
                rows: 0,
                functions: ['check', 'main']
            },
            {
                kind: 'pseudocode',
                path: 'other',
                matches: 1,
                lines: 1,
                rows: 0,
                functions: ['main']
            },
            { kind: 'file', path: 'z.s', matches: 1, lines: 1, rows: 0, functions: [undefined] }
        ])
    })

    it('count matches in Files, an Executable once', () => {
        expect(searchTotals(results)).toEqual({
            matches: 16,
            lines: 16,
            rows: 5,
            documents: 6,
            files: 4
        })
        expect(searchTotals([])).toEqual({ matches: 0, lines: 0, rows: 0, documents: 0, files: 0 })
    })
})

describe("a cached Pseudocode's names", () => {
    /** `main`'s lines as the decompiler gives them, a call to `check` and a read of `secret`. */
    const lines: NamedLine[] = [
        {
            text: 'int main(void)',
            tokens: [
                { start: 0, end: 3, kind: 'type' },
                { start: 4, end: 8, kind: 'function', target: 0x1189 }
            ]
        },
        { text: '{', tokens: [{ start: 0, end: 1, kind: 'syntax' }] },
        {
            text: '  iVar1 = check(secret,"hunter2");',
            tokens: [
                { start: 2, end: 7, kind: 'variable', variable: 'register:0x0:4@+0x8e' },
                { start: 10, end: 15, kind: 'function', target: 0x1100 },
                { start: 16, end: 22, kind: 'variable', target: 0x4010 },
                { start: 23, end: 32, kind: 'constant', target: 0x2004 }
            ]
        },
        {
            text: '  goto code_r0x1200;',
            tokens: [{ start: 7, end: 19, kind: 'syntax', target: 0x1200 }]
        },
        { text: '}', tokens: [{ start: 0, end: 1, kind: 'syntax' }] }
    ]
    const text = lines.map((line) => line.text).join('\n')

    it("are the functions and globals a token names, at the text's offsets", () => {
        const spans = pseudocodeNameSpans(lines)
        expect(spans.map((span) => [text.slice(span.start, span.end), span.target])).toEqual([
            ['main', 0x1189],
            ['check', 0x1100],
            ['secret', 0x4010]
        ])
    })

    it('are written again for a global rename, the later ones moved', () => {
        const spans = pseudocodeNameSpans(lines)
        const names = new Map([
            [0x1100, 'verify_password'],
            [0x4010, 'key']
        ])
        const renamed = rewriteNames(text, spans, (target) => names.get(target))
        expect(renamed.text.split('\n')[2]).toBe('  iVar1 = verify_password(key,"hunter2");')
        expect(renamed.spans.map((span) => renamed.text.slice(span.start, span.end))).toEqual([
            'main',
            'verify_password',
            'key'
        ])
        //and back, by the names the Listing gives again
        const reset = rewriteNames(renamed.text, renamed.spans, (target) =>
            target === 0x1100 ? 'check' : target === 0x4010 ? 'secret' : undefined
        )
        expect(reset).toEqual({ text, spans })
        //no change, the same text
        const same = rewriteNames(text, spans, () => undefined)
        expect(same.text).toBe(text)
        expect(same.spans).toEqual(spans)
    })
})
