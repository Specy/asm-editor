import { describe, expect, it } from 'vitest'
import { makeTokenSpanIndex, tokenSpanEnd } from '$lib/languages/mars/tokenSpans'

/** One line as the Cores shape it, with the token columns the tokenizer would report. */
function line(sourcePath: string, sourceLine: number, source: string, columns: number[]) {
    return {
        sourcePath,
        sourceLine,
        source,
        tokens: columns.map((sourceColumn) => ({
            sourceColumn,
            value: source.slice(sourceColumn - 1).split(/[\s,()]/)[0] ?? ''
        }))
    }
}

const ADDI = '    addi $t0, $t1, notanumber'
const INDEX = makeTokenSpanIndex([line('main.asm', 3, ADDI, [5, 10, 15, 20])])

describe('tokenSpanEnd', () => {
    it('ends the span at the end of the token the diagnostic starts on', () => {
        //`notanumber` starts at column 20 and is ten characters long
        expect(tokenSpanEnd(INDEX, 'main.asm', 3, 20)).toBe(30)
        expect(ADDI.slice(20 - 1, 30 - 1)).toBe('notanumber')
    })

    it('ends the span at the end of a token the diagnostic points into', () => {
        expect(tokenSpanEnd(INDEX, 'main.asm', 3, 7)).toBe(9)
    })

    it('gives up on a column between tokens, so the marker keeps its fallback', () => {
        expect(tokenSpanEnd(INDEX, 'main.asm', 3, 19)).toBeUndefined()
    })

    it('gives up on a diagnostic with no source location', () => {
        expect(tokenSpanEnd(INDEX, 'main.asm', 3, 0)).toBeUndefined()
    })

    it('gives up on a line or file that never tokenized', () => {
        expect(tokenSpanEnd(INDEX, 'main.asm', 4, 5)).toBeUndefined()
        expect(tokenSpanEnd(INDEX, 'other.asm', 3, 5)).toBeUndefined()
    })

    it('keys the line and the file together, so two files do not share a line', () => {
        const index = makeTokenSpanIndex([
            {
                sourcePath: 'a.asm',
                sourceLine: 1,
                source: 'main:',
                tokens: [{ sourceColumn: 1, value: 'main' }]
            },
            {
                sourcePath: 'b.asm',
                sourceLine: 1,
                source: 'longerLabel:',
                tokens: [{ sourceColumn: 1, value: 'longerLabel' }]
            }
        ])
        expect(tokenSpanEnd(index, 'a.asm', 1, 1)).toBe(5)
        expect(tokenSpanEnd(index, 'b.asm', 1, 1)).toBe(12)
    })

    it('gives up when the token value is not the text it came from', () => {
        //a character constant reaches the token list as the number it denotes, so its length says
        //nothing about how much of the line it covers
        const index = makeTokenSpanIndex([
            {
                sourcePath: 'main.asm',
                sourceLine: 1,
                source: "ch:  .byte 'a'",
                tokens: [{ sourceColumn: 12, value: '97' }]
            }
        ])
        expect(tokenSpanEnd(index, 'main.asm', 1, 12)).toBeUndefined()
    })

    it('gives up on a line the assembler rewrote, whose columns are not the source line', () => {
        //`.eqv SIZE, 40` leaves the tokens of `    li $t0, 40` on a line that still reads `SIZE`
        const index = makeTokenSpanIndex([
            {
                sourcePath: 'main.asm',
                sourceLine: 2,
                source: '    li $t0, SIZE',
                tokens: [
                    { sourceColumn: 5, value: 'li' },
                    { sourceColumn: 8, value: '$t0' },
                    { sourceColumn: 13, value: '40' }
                ]
            }
        ])
        expect(tokenSpanEnd(index, 'main.asm', 2, 13)).toBeUndefined()
        //the tokens before the substitution still line up and keep their spans
        expect(tokenSpanEnd(index, 'main.asm', 2, 5)).toBe(7)
    })
})
