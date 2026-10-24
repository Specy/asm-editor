import { describe, expect, it } from 'vite-plus/test'
import {
    countMatches,
    countMatchesAsync,
    findNext,
    findPrevious,
    parseHexPattern,
    parseOffset,
    readsAsHex,
    textPattern
} from './hexSearch'

const pattern = (text: string) => {
    const parsed = parseHexPattern(text)
    if (!parsed.ok) throw new Error(parsed.reason)
    return parsed.pattern
}

describe('going to an offset', () => {
    it('reads hex with or without 0x, and decimal after #', () => {
        expect(parseOffset('1f40', 0x10000)).toEqual({ ok: true, offset: 0x1f40 })
        expect(parseOffset(' 0x1F40 ', 0x10000)).toEqual({ ok: true, offset: 0x1f40 })
        expect(parseOffset('#8000', 0x10000)).toEqual({ ok: true, offset: 8000 })
        expect(parseOffset('0', 1)).toEqual({ ok: true, offset: 0 })
    })

    it('refuses what is no offset, or one past the end', () => {
        expect(parseOffset('main', 100)).toMatchObject({ ok: false })
        expect(parseOffset('#1f', 100)).toMatchObject({ ok: false })
        expect(parseOffset('64', 100)).toEqual({ ok: false, reason: '64 is past the end, at 0x63' })
        expect(parseOffset('0', 0)).toEqual({ ok: false, reason: 'The File is empty' })
    })
})

describe('find', () => {
    it('reads hex bytes with ?? for any byte, spaces optional', () => {
        expect([...pattern('7f 45 ?? 46')]).toEqual([0x7f, 0x45, -1, 0x46])
        expect([...pattern('7F454C46')]).toEqual([0x7f, 0x45, 0x4c, 0x46])
        expect(parseHexPattern('7f4')).toMatchObject({ ok: false })
        expect(parseHexPattern('7f zz')).toEqual({
            ok: false,
            reason: 'zz is not a hex byte or ??'
        })
        expect(parseHexPattern('  ')).toMatchObject({ ok: false })
        const text = textPattern('flag')
        expect(text.ok && [...text.pattern]).toEqual([0x66, 0x6c, 0x61, 0x67])
    })

    it('tells hex bytes, whole or half typed, from text', () => {
        for (const hex of ['', 'deadbeef', '7F 45 ?? 46', '7f, 45', '4c ?', 'abc'])
            expect(readsAsHex(hex), hex).toBe(true)
        for (const text of ['flag{', 'hello', '0x7f', 'de ad g', '%s'])
            expect(readsAsHex(text), text).toBe(false)
    })

    //   0  1  2  3  4  5  6  7  8  9
    const bytes = Uint8Array.from([1, 2, 3, 9, 1, 2, 4, 9, 1, 2])

    it('counts matches in file order, including overlapping patterns and wildcards', () => {
        expect(countMatches(bytes, pattern('01 02'), 4)).toEqual({ index: 2, total: 3 })
        expect(countMatches(bytes, pattern('?? 09'), 6)).toEqual({ index: 2, total: 2 })
        expect(countMatches(bytes, pattern('?? ??'), 8)).toEqual({ index: 9, total: 9 })
        expect(countMatches(Uint8Array.of(1, 1, 1), pattern('01 01'), 1)).toEqual({
            index: 2,
            total: 2
        })
        expect(countMatches(bytes, pattern('ff'), 0)).toEqual({ index: 0, total: 0 })
        expect(countMatches(bytes, new Int16Array(), 0)).toEqual({ index: 0, total: 0 })
        expect(countMatches(Uint8Array.of(1), pattern('01 02'), 0)).toEqual({ index: 0, total: 0 })
    })

    it('counts across chunk boundaries without missing or duplicating overlapping matches', async () => {
        const bytes = new Uint8Array(256 * 1024 + 4).fill(1)
        const offset = 256 * 1024
        expect(
            await countMatchesAsync(
                bytes,
                pattern('?? 01 01'),
                offset,
                new AbortController().signal
            )
        ).toEqual({ index: offset + 1, total: bytes.length - 2 })
    })

    it('cancels a count between chunks', async () => {
        const controller = new AbortController()
        const count = countMatchesAsync(
            new Uint8Array(512 * 1024),
            pattern('00'),
            0,
            controller.signal
        )
        setTimeout(() => controller.abort(), 0)
        expect(await count).toBeUndefined()
        expect(await countMatchesAsync(bytes, pattern('??'), 0, controller.signal)).toBeUndefined()
    })

    it('finds the next match at or after an offset, wrapping round', () => {
        expect(findNext(bytes, pattern('01 02'), 0)).toEqual({ offset: 0, wrapped: false })
        expect(findNext(bytes, pattern('01 02'), 1)).toEqual({ offset: 4, wrapped: false })
        expect(findNext(bytes, pattern('01 02'), 9)).toEqual({ offset: 0, wrapped: true })
        expect(findNext(bytes, pattern('01 02 ?? 09'), 1)).toEqual({ offset: 4, wrapped: false })
        //a pattern starting with a wildcard, and one of wildcards only
        expect(findNext(bytes, pattern('?? 04'), 0)).toEqual({ offset: 5, wrapped: false })
        expect(findNext(bytes, pattern('?? ??'), 8)).toEqual({ offset: 8, wrapped: false })
        expect(findNext(bytes, pattern('?? ??'), 9)).toEqual({ offset: 0, wrapped: true })
        expect(findNext(bytes, pattern('05'), 0)).toBeUndefined()
    })

    it('finds the previous match at or before an offset, wrapping round', () => {
        expect(findPrevious(bytes, pattern('01 02'), 9)).toEqual({ offset: 8, wrapped: false })
        expect(findPrevious(bytes, pattern('01 02'), 7)).toEqual({ offset: 4, wrapped: false })
        expect(findPrevious(bytes, pattern('01 02'), -1)).toEqual({ offset: 8, wrapped: true })
        expect(findPrevious(bytes, pattern('?? 09'), 9)).toEqual({ offset: 6, wrapped: false })
        //a match is never past the end, where the pattern would not fit
        expect(findPrevious(bytes, pattern('02 ??'), 9)).toEqual({ offset: 5, wrapped: false })
        expect(findPrevious(bytes, pattern('09 09'), 9)).toBeUndefined()
    })
})
