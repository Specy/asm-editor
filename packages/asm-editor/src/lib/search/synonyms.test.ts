import { describe, expect, it } from 'vite-plus/test'
import table from './synonyms.json'
import { expandedTerms, synonymIndex, synonymsOf, type SynonymRow } from './synonyms'

const rows = synonymIndex([
    { reader: 'for loop', documentation: ['counter', 'branch'] },
    { reader: 'loop', documentation: ['repeat'] },
    { reader: 'end of the program', documentation: ['exit', 'terminate'] },
    { reader: 'print', documentation: ['display'] }
])

describe('the synonym table', () => {
    it('matches a phrase before the words in it', () => {
        expect(synonymsOf('write a for loop', rows)).toEqual(['counter', 'branch'])
        expect(synonymsOf('loop until zero', rows)).toEqual(['repeat'])
    })

    it('matches a phrase across the stop words in it', () => {
        expect(synonymsOf('jump to the end of the program', rows)).toEqual(['exit', 'terminate'])
        // the stop words are part of the phrase, not skipped: "end of program" is another phrase
        expect(synonymsOf('end of program', rows)).toEqual([])
    })

    it('reads words without capitals or the punctuation of a sentence', () => {
        expect(synonymsOf('How do I PRINT?', rows)).toEqual(['display'])
        expect(synonymsOf('"for loop", in MIPS', rows)).toEqual(['counter', 'branch'])
    })

    it("adds the Documentation's words to a question's words, stop words left out", () => {
        expect(expandedTerms('how do I print a number', rows)).toBe('print number display')
        // "for" is a stop word, dropped from the words searched, but it still makes the phrase
        expect(expandedTerms('print a for loop', rows)).toBe('print loop display counter branch')
    })

    it('leaves a single word alone, since it is usually a name', () => {
        expect(expandedTerms('print', rows)).toBe('print')
        expect(expandedTerms('loop', rows)).toBe('loop')
    })

    it('holds rows a reader types, each with words of its own', () => {
        const readers = (table as SynonymRow[]).map((row) => row.reader)
        expect(new Set(readers).size).toBe(readers.length)
        for (const row of table as SynonymRow[]) {
            expect(row.reader).toBe(row.reader.toLowerCase().trim())
            expect(row.documentation.length).toBeGreaterThan(0)
            expect(row.documentation).not.toContain(row.reader)
        }
    })
})
