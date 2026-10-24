/**
 * Matching one text for the Search panel
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decisions 24
 * and 26): the research's query kinds over real Listings, checked against plain JavaScript, and
 * each rule of a row.
 */
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vite-plus/test'
import { loadDecoder } from '../listing/decoder'
import { generateListing } from '../listing/generateListing'
import { compileMatcher, type SearchQuery } from './query'
import { eachMatch, ROW_TEXT_LIMIT, SearchText, searchText, type SearchRow } from './searchText'

const fixture = (name: string) =>
    new Uint8Array(
        readFileSync(
            new URL(`../../../../x86/blink-js/tests/fixtures/elf/${name}`, import.meta.url)
        )
    )

/** Some of `factcheck`'s Pseudocode, as Ghidra prints it. */
const PSEUDOCODE = `undefined8 main(int param_1,long param_2)

{
  int iVar1;
  char *pcVar2;
  size_t sVar3;
  char acStack_98 [136];

  printf("Password: ");
  pcVar2 = fgets(acStack_98,0x88,stdin);
  if (pcVar2 != (char *)0x0) {
    sVar3 = strcspn(acStack_98,"\\n");
    acStack_98[sVar3] = '\\0';
    iVar1 = strcmp(acStack_98,"hunter2");
    if (iVar1 == 0) {
      puts("Correct!");
      return 0;
    }
    iVar1 = strncmp(acStack_98,"hunter",6);
  }
  puts("Wrong.");
  return 1;
}
`

let texts: Record<string, string>

beforeAll(async () => {
    const decoder = await loadDecoder()
    const listing = (name: string) =>
        generateListing(decoder, {
            bytes: fixture(name),
            name,
            base: 0x555555554000,
            version: 'v1'
        }).text
    texts = { crackme: listing('crackme'), cpp: listing('cpp'), pseudocode: PSEUDOCODE }
})

function search(text: string, query: SearchQuery, maxRows = Infinity) {
    const matcher = compileMatcher(query)!
    return searchText(new SearchText(text), matcher, maxRows)
}

/** Every match, as `[start, end]` offsets in the text. */
function matchesOf(text: string, query: SearchQuery) {
    const found: [number, number][] = []
    eachMatch(new SearchText(text), compileMatcher(query)!, (start, end) =>
        found.push([start, end])
    )
    return found
}

/** What plain JavaScript finds: every match's offsets, and the 1-based lines holding them. */
function reference(text: string, pattern: RegExp) {
    const offsets = [...text.matchAll(pattern)].map(
        (match) => [match.index, match.index + match[0].length] as [number, number]
    )
    const starts = [0]
    for (let at = text.indexOf('\n'); at >= 0; at = text.indexOf('\n', at + 1)) starts.push(at + 1)
    const lineOf = (offset: number) => {
        let line = 0
        while (line + 1 < starts.length && starts[line + 1] <= offset) line++
        return line + 1
    }
    return { offsets, lines: [...new Set(offsets.map(([start]) => lineOf(start)))] }
}

const WORD = '[\\p{L}\\p{N}\\p{M}\\p{Pc}]'

describe("the research's queries", () => {
    const cases: [string, SearchQuery, RegExp][] = [
        ['strcmp in any case', { text: 'StrCmp' }, /strcmp/giu],
        ['e in any case', { text: 'e' }, /e/giu],
        ['an absent word in any case', { text: 'zqxjv' }, /zqxjv/giu],
        ['an absent word in its case', { text: 'zqxjv', matchCase: true }, /zqxjv/gu],
        [
            'rax as a whole word in any case',
            { text: 'RAX', wholeWord: true },
            new RegExp(`(?<!${WORD})rax(?!${WORD})`, 'giu')
        ],
        ['/str(n)?cmp\\(/', { text: 'str(n)?cmp\\(', regex: true }, /str(n)?cmp\(/giu],
        [
            '/\\w+Var\\d+/ in its case',
            { text: '\\w+Var\\d+', regex: true, matchCase: true },
            /\w+Var\d+/gu
        ],
        [
            '/mov\\s+\\w+,\\s*\\[r[bs]p/',
            { text: 'mov\\s+\\w+, *\\[r[bs]p', regex: true },
            /mov\s+\w+, *\[r[bs]p/giu
        ]
    ]

    for (const [name, query, pattern] of cases)
        it(`finds ${name} as JavaScript does, on every line it is`, () => {
            for (const [source, text] of Object.entries(texts)) {
                const expected = reference(text, pattern)
                expect(matchesOf(text, query), source).toEqual(expected.offsets)
                const found = search(text, query)
                expect(found.matches, source).toBe(expected.offsets.length)
                expect(found.lines, source).toBe(expected.lines.length)
                expect(
                    found.rows.map((row) => row.line),
                    source
                ).toEqual(expected.lines)
            }
        })

    it('finds what the research measured in its texts', () => {
        expect(search(texts.crackme, { text: 'strcmp' }).matches).toBeGreaterThan(0)
        expect(search(texts.pseudocode, { text: '\\w+Var\\d+', regex: true }).matches).toBe(10)
        expect(search(texts.pseudocode, { text: 'str(n)?cmp\\(', regex: true }).matches).toBe(2)
        expect(search(texts.crackme, { text: '\\w+Var\\d+', regex: true }).matches).toBe(0)
    })
})

describe('a row', () => {
    it("is the line's number, its text, and where each match is on it", () => {
        const text = 'mov rax, rbx\r\nxor RAX, rax\n\npush rax'
        expect(search(text, { text: 'rax' }).rows).toEqual<SearchRow[]>([
            { line: 1, text: 'mov rax, rbx', textStart: 0, ranges: [{ start: 4, end: 7 }] },
            {
                line: 2,
                text: 'xor RAX, rax',
                textStart: 0,
                ranges: [
                    { start: 4, end: 7 },
                    { start: 9, end: 12 }
                ]
            },
            { line: 4, text: 'push rax', textStart: 0, ranges: [{ start: 5, end: 8 }] }
        ])
    })

    it('counts lines as Monaco does: `\\n`, `\\r\\n` and a lone `\\r`', () => {
        const found = search('a\rb a\r\nc\n\ra', { text: 'a' })
        expect(found.rows.map((row) => [row.line, row.text])).toEqual([
            [1, 'a'],
            [2, 'b a'],
            [5, 'a']
        ])
        expect(new SearchText('a\n').lineStarts).toEqual(Int32Array.from([0, 2]))
    })

    it('finds a query with Match case in its case only', () => {
        expect(search('Main main MAIN', { text: 'main', matchCase: true }).rows[0].ranges).toEqual([
            { start: 5, end: 9 }
        ])
        expect(search('Main main MAIN', { text: 'main' }).matches).toBe(3)
        expect(
            search('Main main MAIN', { text: 'MAIN', regex: true, matchCase: true }).matches
        ).toBe(1)
        expect(search('Main main MAIN', { text: 'MA.N', regex: true }).matches).toBe(3)
    })

    it('finds matches that do not overlap, and a whole word where another was refused', () => {
        expect(matchesOf('aaaa', { text: 'aa' })).toEqual([
            [0, 2],
            [2, 4]
        ])
        expect(matchesOf('ba a a', { text: 'a a', wholeWord: true })).toEqual([[3, 6]])
        expect(matchesOf('xab ab', { text: 'ab', wholeWord: true })).toEqual([[4, 6]])
        expect(matchesOf('baab ab', { text: '\\w*ab', regex: true, wholeWord: true })).toEqual([
            [0, 4],
            [5, 7]
        ])
    })

    it('takes whole words next to `@`, `.` and `_`', () => {
        const listing = [
            '    call printf@plt',
            '    call __printf_chk@plt',
            '    jmp .LAB_3',
            '.LAB_3:',
            'printf_positional:'
        ].join('\n')
        expect(
            search(listing, { text: 'printf', wholeWord: true }).rows.map((row) => row.line)
        ).toEqual([1])
        expect(search(listing, { text: 'plt', wholeWord: true }).matches).toBe(2)
        expect(search(listing, { text: 'LAB_3', wholeWord: true }).matches).toBe(2)
        expect(search(listing, { text: 'LAB', wholeWord: true }).matches).toBe(0)
        expect(search(listing, { text: '__printf_chk', wholeWord: true }).matches).toBe(1)
    })

    it("finds a query in any case in a text that lowering lengthens, at the text's offsets", () => {
        //`İ` lowers to two code units: the lower-case copy cannot be used
        const text = 'İstanbul main\nMAIN İ'
        expect(new SearchText(text).lowered).toBeUndefined()
        expect(search(text, { text: 'main' }).rows).toEqual<SearchRow[]>([
            { line: 1, text: 'İstanbul main', textStart: 0, ranges: [{ start: 9, end: 13 }] },
            { line: 2, text: 'MAIN İ', textStart: 0, ranges: [{ start: 0, end: 4 }] }
        ])
        expect(search(text, { text: 'STANBUL' }).rows[0].ranges).toEqual([{ start: 1, end: 8 }])
    })
})

describe('a regular expression', () => {
    it('anchors `^` and `$` at each line', () => {
        const text = 'push rbp\nmov rbp, rsp\r\npop rbp'
        expect(search(text, { text: 'rbp$', regex: true }).rows.map((row) => row.line)).toEqual([
            1, 3
        ])
        expect(search(text, { text: '^\\w+', regex: true }).matches).toBe(3)
    })

    it('finds zero-length matches, one a character, as JavaScript does', () => {
        const found = search('ab\n\ncd', { text: '^', regex: true })
        expect(found.rows.map((row) => [row.line, row.ranges])).toEqual([
            [1, [{ start: 0, end: 0 }]],
            [2, [{ start: 0, end: 0 }]],
            [3, [{ start: 0, end: 0 }]]
        ])
        expect(matchesOf('aab', { text: 'a*', regex: true })).toEqual([
            [0, 2],
            [2, 2],
            [3, 3]
        ])
        //a surrogate pair is one character to a `u` pattern: no match between its halves
        expect(matchesOf('😀😀', { text: '(?:)', regex: true })).toEqual([
            [0, 0],
            [2, 2],
            [4, 4]
        ])
        expect(search('a b', { text: '\\b', regex: true }).matches).toBe(4)
    })

    it('takes no `^` between the two characters of a `\\r\\n`', () => {
        expect(
            search('a\r\nb\r\n', { text: '^', regex: true }).rows.map((row) => row.line)
        ).toEqual([1, 2, 3])
        expect(search('a\r\nb', { text: '$', regex: true }).rows.map((row) => row.ranges)).toEqual([
            [{ start: 1, end: 1 }],
            [{ start: 1, end: 1 }]
        ])
    })

    it('stays on its line unless it names a line break', () => {
        //`\s+` would take the line break and the next line's indent
        const text = '    ret   \n\nmain:\n    push rbp'
        expect(search(text, { text: 'ret\\s+', regex: true }).rows).toEqual<SearchRow[]>([
            { line: 1, text: '    ret   ', textStart: 0, ranges: [{ start: 4, end: 10 }] }
        ])
        expect(search(text, { text: '[^x]+', regex: true }).rows.map((row) => row.ranges)).toEqual([
            [{ start: 0, end: 10 }],
            [{ start: 0, end: 5 }],
            [{ start: 0, end: 12 }]
        ])
        //a match the whole text would end on the next line is looked for in its line alone
        expect(
            search('ab\nb', { text: 'b\\s*b?', regex: true }).rows.map((row) => row.ranges)
        ).toEqual([[{ start: 1, end: 2 }], [{ start: 0, end: 1 }]])
    })

    it('reads no further than its line, so a pattern that could run on stays fast', () => {
        //a static program's Listing has 150,000 lines: over the whole text, `[\s\S]*` would read
        //to its end from every `call`, for seconds, and the search would time out
        const instructions = ['mov rax, qword [rbp-0x8]', 'call puts@plt', 'add rsp, 0x10', 'ret']
        const lines = Array.from(
            { length: 100_000 },
            (_, k) =>
                `    ${instructions[k % instructions.length]}${k % 1000 === 1 ? ' ; call it a ret' : ''}`
        )
        const text = new SearchText(lines.join('\n'))
        void text.lineStarts
        for (const pattern of ['call[\\s\\S]*ret', 'call[^;]*;', 'mov\\W*xyz']) {
            const started = performance.now()
            const found = searchText(text, compileMatcher({ text: pattern, regex: true })!, 2_000)
            const took = performance.now() - started
            expect(took, pattern).toBeLessThan(1_000)
            if (pattern === 'mov\\W*xyz') expect(found.matches).toBe(0)
            else expect(found.lines, pattern).toBe(100)
        }
    })

    it('runs onto the lines after when it names a line break', () => {
        const text = '    ret\r\n\r\nmain:\n    push rbp'
        const found = search(text, { text: 'ret\\s*\\n\\s*main', regex: true })
        expect(found).toEqual({
            matches: 1,
            lines: 1,
            rows: [
                {
                    line: 1,
                    text: '    ret',
                    textStart: 0,
                    ranges: [{ start: 4, end: 7, endLine: 3, endColumn: 4 }]
                }
            ]
        })
        expect(search('a\nb', { text: '\\n', regex: true }).rows).toEqual<SearchRow[]>([
            {
                line: 1,
                text: 'a',
                textStart: 0,
                ranges: [{ start: 1, end: 1, endLine: 2, endColumn: 0 }]
            }
        ])
    })
})

describe('the row limit', () => {
    it('lists at most so many rows, and counts every match and line past it', () => {
        const text = Array.from({ length: 30 }, (_, line) => `line ${line} e e`).join('\n')
        const found = search(text, { text: 'e' }, 10)
        expect(found.matches).toBe(90)
        expect(found.lines).toBe(30)
        expect(found.rows).toHaveLength(10)
        expect(found.rows.at(-1)?.line).toBe(10)
        expect(search(text, { text: 'e' }, 0)).toEqual({ matches: 90, lines: 30, rows: [] })
    })

    it('cuts a long line to its part around the first match, keeping offsets in the line', () => {
        const line = `${'x'.repeat(5_000)}needle${'y'.repeat(200)}needle${'z'.repeat(5_000)}needle`
        const [row] = search(`${line}\nneedle`, { text: 'needle' }).rows
        expect(row.text).toHaveLength(ROW_TEXT_LIMIT)
        expect(row.textStart).toBe(4_900)
        expect(row.text.slice(100, 106)).toBe('needle')
        //the third match is past the part kept: counted, not listed
        expect(row.ranges).toEqual([
            { start: 5_000, end: 5_006 },
            { start: 5_206, end: 5_212 }
        ])
        expect(search(line, { text: 'needle' }).matches).toBe(3)
        //near its end, the part kept is the line's last
        const [last] = search(`${'x'.repeat(2_000)}needle`, { text: 'needle' }).rows
        expect(last.textStart).toBe(2_006 - ROW_TEXT_LIMIT)
        expect(last.text.endsWith('needle')).toBe(true)
    })

    it('never cuts a surrogate pair in two', () => {
        //the part would start on the second half of a pair, and end on the first half of one
        const line = `a${'😀'.repeat(2_000)}-needle${'😀'.repeat(2_000)}`
        const [row] = search(line, { text: 'needle' }).rows
        expect(row.textStart).toBe(4_002 - 100 - 1)
        expect(row.text).toHaveLength(ROW_TEXT_LIMIT - 1)
        expect(row.text).toMatch(/^😀/u)
        expect(row.text).toMatch(/😀$/u)
    })
})
