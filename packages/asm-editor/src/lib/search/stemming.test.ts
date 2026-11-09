import { describe, expect, it } from 'vite-plus/test'
import { englishWords, stem, stemmedText, stemmedWord } from './stemming'

describe('stem', () => {
    it("gives Porter's stems for the examples of his paper", () => {
        const examples: Record<string, string> = {
            caresses: 'caress',
            ponies: 'poni',
            ties: 'ti',
            caress: 'caress',
            cats: 'cat',
            feed: 'feed',
            agreed: 'agre',
            plastered: 'plaster',
            bled: 'bled',
            motoring: 'motor',
            sing: 'sing',
            conflated: 'conflat',
            troubled: 'troubl',
            sized: 'size',
            hopping: 'hop',
            tanned: 'tan',
            falling: 'fall',
            hissing: 'hiss',
            fizzed: 'fizz',
            failing: 'fail',
            filing: 'file',
            happy: 'happi',
            sky: 'sky',
            relational: 'relat',
            conditional: 'condit',
            rational: 'ration',
            digitizer: 'digit',
            operator: 'oper',
            hopefulness: 'hope',
            callousness: 'callous',
            formality: 'formal',
            triplicate: 'triplic',
            formative: 'form',
            electrical: 'electr',
            goodness: 'good',
            revival: 'reviv',
            allowance: 'allow',
            inference: 'infer',
            airliner: 'airlin',
            adjustable: 'adjust',
            irritant: 'irrit',
            replacement: 'replac',
            adjustment: 'adjust',
            dependent: 'depend',
            adoption: 'adopt',
            communism: 'commun',
            activate: 'activ',
            effective: 'effect',
            probate: 'probat',
            rate: 'rate',
            cease: 'ceas',
            controlling: 'control',
            roll: 'roll'
        }
        for (const [word, expected] of Object.entries(examples))
            expect(stem(word), word).toBe(expected)
    })

    it('brings the forms of a word together and keeps different words apart', () => {
        expect(stem('divides')).toBe(stem('divide'))
        expect(stem('dividing')).toBe(stem('divide'))
        expect(stem('strings')).toBe('string')
        expect(stem('instructions')).toBe(stem('instruct'))
        expect(stem('operation')).toBe('oper')
        expect(stem('operand')).toBe('operand')
    })
})

describe('stemmed text', () => {
    it('holds the English words of prose, stemmed, and nothing that is code', () => {
        expect(stemmedText('Divides $t0 by move.l, .data or x86 (see DIVS) and returns.')).toBe(
            'divid_ see_ return_'
        )
    })

    it('splits hyphenated words and drops the punctuation around words', () => {
        expect(stemmedText('Zero-extended, “quoted” words: done.')).toBe(
            'zero_ extend_ quot_ word_ done_'
        )
    })

    it('stems a query word as the text, and leaves out what is not an English word', () => {
        expect(stemmedWord('Divides?')).toBe('divid_')
        expect(stemmedWord('$t0')).toBeNull()
        expect(stemmedWord('MOVE')).toBeNull()
        expect(stemmedWord('the')).toBeNull()
    })

    it('finds the ordinary words of a text, as the word-like names are counted', () => {
        expect(englishWords('Use LOOP to loop; a loop.')).toEqual(['use', 'loop', 'loop'])
    })
})
