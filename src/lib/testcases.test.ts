import { describe, expect, it } from 'vitest'
import type { Testcase, TestcaseResult } from '$lib/Project.svelte'
import {
    canonicalRegister,
    checkCount,
    describeCharacter,
    escapeText,
    firstByteDifference,
    firstTextDifference,
    formatHex,
    hexPrefix,
    isDecimalText,
    makeEmptyTestcase,
    matchResults,
    memoryValueLength,
    parseNumber,
    parseNumberList,
    sortRegisters,
    testcaseContentKey,
    testcaseLabel,
    unescapeText
} from './testcases'

function testcaseWith(part: Partial<Testcase>): Testcase {
    return { ...makeEmptyTestcase(), ...part }
}

describe('parseNumber', () => {
    it('reads hex with either prefix, binary and decimal', () => {
        expect(parseNumber('$1F')).toEqual({ ok: true, value: 31n })
        expect(parseNumber('0x1f')).toEqual({ ok: true, value: 31n })
        expect(parseNumber('%101')).toEqual({ ok: true, value: 5n })
        expect(parseNumber('0b101')).toEqual({ ok: true, value: 5n })
        expect(parseNumber(' 30 ')).toEqual({ ok: true, value: 30n })
    })

    it('reads a sign and a 68000 immediate', () => {
        expect(parseNumber('-1')).toEqual({ ok: true, value: -1n })
        expect(parseNumber('-$10')).toEqual({ ok: true, value: -16n })
        expect(parseNumber('+7')).toEqual({ ok: true, value: 7n })
        expect(parseNumber('#$FF')).toEqual({ ok: true, value: 255n })
    })

    it('refuses hex digits without a prefix, naming the prefix to use', () => {
        expect(parseNumber('FF', { prefix: '$' })).toEqual({
            ok: false,
            reason: 'write $FF for a hexadecimal number'
        })
    })

    it('refuses what is not a number', () => {
        expect(parseNumber('').ok).toBe(false)
        expect(parseNumber('$').ok).toBe(false)
        expect(parseNumber('0xZZ').ok).toBe(false)
        expect(parseNumber('%102').ok).toBe(false)
        expect(parseNumber('1.5').ok).toBe(false)
    })

    it('accepts a width read either signed or unsigned, and nothing wider', () => {
        expect(parseNumber('$FF', { bytes: 1 }).ok).toBe(true)
        expect(parseNumber('-128', { bytes: 1 }).ok).toBe(true)
        expect(parseNumber('256', { bytes: 1 })).toEqual({
            ok: false,
            reason: '256 does not fit 1 byte'
        })
        expect(parseNumber('-129', { bytes: 1 }).ok).toBe(false)
        expect(parseNumber('$FFFFFFFF', { bytes: 4 }).ok).toBe(true)
    })

    it('refuses a negative number where it cannot be one', () => {
        expect(parseNumber('-4', { signed: false })).toEqual({
            ok: false,
            reason: '-4 is negative'
        })
    })
})

describe('isDecimalText', () => {
    it('tells decimal from the prefixed bases', () => {
        expect(isDecimalText('-12')).toBe(true)
        expect(isDecimalText('$12')).toBe(false)
        expect(isDecimalText('0x12')).toBe(false)
        expect(isDecimalText('%1')).toBe(false)
    })
})

describe('formatHex', () => {
    it("writes the Target's prefix in whole bytes, padded to the digits asked for", () => {
        expect(formatHex(16n, { prefix: hexPrefix('M68K'), minDigits: 4 })).toBe('$0010')
        expect(formatHex(0xc8n, { prefix: hexPrefix('MIPS'), bytes: 1 })).toBe('0xC8')
        expect(formatHex(0x12345n, { prefix: '$', minDigits: 4 })).toBe('$012345')
    })

    it('writes a negative value as its two complement at a width', () => {
        expect(formatHex(-1n, { prefix: '$', bytes: 4 })).toBe('$FFFFFFFF')
        expect(formatHex(-2n, { prefix: '0x', bytes: 1 })).toBe('0xFE')
        expect(formatHex(-2n, { prefix: '0x' })).toBe('-0x02')
    })
})

describe('parseNumberList', () => {
    it('splits on spaces and commas', () => {
        expect(parseNumberList('$01 $02, 3,4', { bytes: 1 })).toEqual({
            ok: true,
            values: [1n, 2n, 3n, 4n]
        })
    })

    it('refuses an empty list and reports the first bad value', () => {
        expect(parseNumberList(' , ').ok).toBe(false)
        expect(parseNumberList('1 300', { bytes: 1 })).toEqual({
            ok: false,
            reason: '300 does not fit 1 byte'
        })
    })
})

describe('escapeText and unescapeText', () => {
    it('round trips the control characters a string is likely to hold', () => {
        const text = 'a\\b\n\t\r\0\x01"'
        const escaped = escapeText(text)
        expect(escaped).toBe('a\\\\b\\n\\t\\r\\0\\x01"')
        expect(unescapeText(escaped)).toEqual({ ok: true, value: text })
    })

    it('refuses an unknown or unfinished escape', () => {
        expect(unescapeText('a\\q').ok).toBe(false)
        expect(unescapeText('a\\').ok).toBe(false)
        expect(unescapeText('\\x4').ok).toBe(false)
        expect(unescapeText('\\x41')).toEqual({ ok: true, value: 'A' })
    })
})

describe('memoryValueLength', () => {
    it('counts the bytes each kind of value covers', () => {
        expect(memoryValueLength({ type: 'number', address: 0n, bytes: 2, expected: 0n })).toBe(2)
        expect(
            memoryValueLength({ type: 'number-chunk', address: 0n, bytes: 2, expected: [1n, 2n] })
        ).toBe(4)
        expect(memoryValueLength({ type: 'string-chunk', address: 0n, expected: 'hé' })).toBe(3)
    })
})

describe('testcaseLabel', () => {
    it('uses the name, or the place in the list without one', () => {
        expect(testcaseLabel(testcaseWith({ name: ' Sum ' }), 0)).toBe('Sum')
        expect(testcaseLabel(testcaseWith({ name: '' }), 2)).toBe('Testcase 3')
        expect(testcaseLabel(testcaseWith({}), 0)).toBe('Testcase 1')
    })
})

describe('checkCount', () => {
    it('counts each expectation and the output', () => {
        const testcase = testcaseWith({
            expectedRegisters: { D0: 1n, D1: 2n },
            expectedMemory: [{ type: 'number', address: 0n, bytes: 1, expected: 0n }]
        })
        expect(checkCount(testcase)).toBe(4)
        expect(checkCount(makeEmptyTestcase())).toBe(1)
    })
})

describe('matchResults', () => {
    const sum = testcaseWith({ name: 'Sum', input: ['10', '20'], expectedOutput: '30' })
    const zero = testcaseWith({ input: ['0'], expectedOutput: '0' })
    const results: TestcaseResult[] = [
        { passed: false, errors: [], testcase: structuredClone(sum) },
        { passed: true, errors: [], testcase: structuredClone(zero) }
    ]

    it('finds the result run on the same content, wherever it now is', () => {
        expect(matchResults([zero, sum], results)).toEqual([results[1], results[0]])
    })

    it('has no result for a Testcase edited or added since the run', () => {
        const edited = { ...sum, expectedOutput: '31' }
        expect(matchResults([edited, makeEmptyTestcase()], results)).toEqual([undefined, undefined])
    })

    it('keeps the result of a renamed Testcase', () => {
        expect(matchResults([{ ...sum, name: 'Renamed' }], results)).toEqual([results[0]])
    })

    it('ignores the order registers were added in', () => {
        const a = testcaseWith({ startingRegisters: { D0: 1n, D1: 2n } })
        const b = testcaseWith({ startingRegisters: { D1: 2n, D0: 1n } })
        expect(testcaseContentKey(a)).toBe(testcaseContentKey(b))
    })
})

describe('firstByteDifference', () => {
    it('finds the first differing byte and counts them all', () => {
        expect(firstByteDifference([1, 2, 3, 5], [1, 2, 3, 4])).toEqual({
            offset: 3,
            got: 4,
            count: 1
        })
        expect(firstByteDifference([1, 2, 3], [9, 2, 9])).toEqual({ offset: 0, got: 9, count: 2 })
        expect(firstByteDifference([1, 2], [1, 2])).toBeUndefined()
    })
})

describe('firstTextDifference and describeCharacter', () => {
    it('finds where two outputs part', () => {
        expect(firstTextDifference('30\n', '30')).toBe(2)
        expect(firstTextDifference('abc', 'abd')).toBe(2)
        expect(firstTextDifference('same', 'same')).toBe(-1)
        expect(describeCharacter('30\n', 2)).toBe('"\\n"')
        expect(describeCharacter('30', 2)).toBe('the end')
    })
})

describe('canonicalRegister and sortRegisters', () => {
    const names = ['D0', 'D1', 'A0']

    it('spells a register as the Target does', () => {
        expect(canonicalRegister('d1', names)).toBe('D1')
        expect(canonicalRegister('x9', names)).toBe('x9')
    })

    it('orders registers as the Target lists them', () => {
        expect(sortRegisters(['A0', 'x9', 'd1', 'D0'], names)).toEqual(['D0', 'd1', 'A0', 'x9'])
    })
})
