import { describe, expect, it } from 'vite-plus/test'
import {
    createTextStreamDecoder,
    encodeText,
    SerialTranscript,
    terminalTextConventions,
    type TerminalEncoding
} from './terminalText'

const everyByte = Uint8Array.from({ length: 256 }, (_, byte) => byte)

/**
 * Windows-1252's bytes `0x80`–`0x9F` as the WHATWG Encoding Standard maps them, written out here
 * rather than read from `TextDecoder`, whose table depends on the platform's ICU data.
 */
const WINDOWS_1252_HIGH = [...'€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ']

/** Every byte decoded as Windows-1252: Latin-1 except for the typographic `0x80`–`0x9F`. */
function everyByteAsWindows1252(): string {
    return [...everyByte]
        .map((byte) =>
            byte >= 0x80 && byte < 0xa0 ? WINDOWS_1252_HIGH[byte - 0x80] : String.fromCharCode(byte)
        )
        .join('')
}

describe('terminal text conventions', () => {
    it("follows each Target's Reference environment", () => {
        expect(terminalTextConventions('M68K')).toEqual({
            encoding: 'windows-1252',
            enter: '\r',
            serialLine: false
        })
        expect(terminalTextConventions('Z80')).toEqual({
            encoding: 'latin-1',
            enter: '\n',
            serialLine: false
        })
        for (const language of ['MIPS', 'RISC-V', 'RISC-V-64'] as const) {
            expect(terminalTextConventions(language)).toEqual({
                encoding: 'utf-8',
                enter: '\n',
                serialLine: false
            })
        }
        //ADR 0068: x86's Terminal is the guest's serial console
        expect(terminalTextConventions('X86')).toEqual({
            encoding: 'utf-8',
            enter: '\n',
            serialLine: true
        })
    })
})

describe('the serial line', () => {
    /** What `text` shows written at once, `\n` returning unless `staircase`. */
    function shown(text: string, staircase = false): SerialTranscript {
        const serial = new SerialTranscript()
        serial.write(text, !staircase)
        return serial
    }

    it('appends what only adds to the end, line feeds included', () => {
        expect(shown('one\ntwo\n').text).toBe('one\ntwo\n')
        expect(shown('one\ntwo\n').cursor).toBe(8)
    })

    it('overwrites the line from its start after a carriage return', () => {
        expect(shown('loading 10%\rloading 20%').text).toBe('loading 20%')
        expect(shown('abcdef\rXY').text).toBe('XYcdef')
        expect(shown('abcdef\rXY').cursor).toBe(2)
        //only the last line: what came before it is never written into
        expect(shown('first\nabc\rX').text).toBe('first\nXbc')
    })

    it("takes ONLCR's carriage return and line feed as one new line", () => {
        expect(shown('hello\r\nworld\r\n').text).toBe('hello\nworld\n')
        //a new line starts after the whole of the line, whatever column the cursor is in
        expect(shown('abc\rX\r\n').text).toBe('Xbc\n')
        expect(shown('abc\rX\n').text).toBe('Xbc\n')
    })

    it('moves down without returning when the output is unprocessed, the staircase', () => {
        expect(shown('a\nb\nc', true).text).toBe('a\n b\n  c')
        expect(shown('ab\r\ncd', true).text).toBe('ab\ncd')
        //a sequence takes no column, so it does not widen the step
        expect(shown('\x1b[31mab\x1b[0m\nc', true).text).toBe('\x1b[31mab\x1b[0m\n  c')
    })

    it('steps back a column on a backspace, never past the start of the line', () => {
        expect(shown('abc\b\bX').text).toBe('aXc')
        expect(shown('ab\b \b').text).toBe('a ')
        expect(shown('ab\b \b').cursor).toBe(1)
        expect(shown('x\nab\b\b\b\bY').text).toBe('x\nYb')
    })

    it('overwrites and steps back over whole characters outside the Basic Multilingual Plane', () => {
        expect(shown('😀b\rX').text).toBe('Xb')
        expect(shown('a😀\b!').text).toBe('a!')
        expect(shown('ab\r😀').text).toBe('😀b')
    })

    it('keeps escape sequences where they were, stepping over them as it overwrites', () => {
        expect(shown('\x1b[31mred\x1b[0m\rX').text).toBe('\x1b[31mXed\x1b[0m')
        expect(shown('ab\x1b[1mcd\rxyz').text).toBe('xy\x1b[1mzd')
        expect(shown('ab\x1b[0m\rxyz').text).toBe('xy\x1b[0mz')
    })

    it('puts a sequence written inside the line where the cursor is once it is complete', () => {
        const serial = shown('abcd\r')
        for (const character of '\x1b[32mX') serial.write(character, true)
        expect(serial.text).toBe('\x1b[32mXbcd')
        expect(serial.pendingEscape).toBe('')
        const split = shown('abcd\rX\x1b[')
        expect(split.text).toBe('Xbcd')
        expect(split.pendingEscape).toBe('\x1b[')
        split.write('1mY', true)
        expect(split.text).toBe('X\x1b[1mYcd')
    })

    it('says when a write may change what is already there', () => {
        const serial = shown('abc')
        expect(serial.mayEdit('def\n')).toBe(false)
        expect(serial.mayEdit('\rX')).toBe(true)
        expect(serial.mayEdit('\b')).toBe(true)
        serial.write('\r', true)
        expect(serial.mayEdit('X')).toBe(true)
    })

    it('erases an echo off the end of the line, or with a space inside it', () => {
        const serial = shown('> ab')
        expect(serial.erase('b')).toBe(true)
        expect(serial.text).toBe('> a')
        expect(serial.erase('x')).toBe(false)
        const inside = shown('> abcd\r> X')
        expect(inside.erase('X')).toBe(true)
        expect(inside.text).toBe('>  bcd')
        expect(inside.cursor).toBe(2)
    })

    it('keeps the cursor where it was when text is put before everything', () => {
        const serial = shown('abc\r')
        serial.prepend('head\n\n')
        expect(serial.text).toBe('head\n\nabc')
        serial.write('X', true)
        expect(serial.text).toBe('head\n\nXbc')
    })

    it('starts again from a transcript and a cursor, as Undo restores them', () => {
        const serial = new SerialTranscript()
        serial.reset('one\ntwo', 5)
        expect(serial.lineStart).toBe(4)
        expect(serial.lastLine).toBe('two')
        serial.write('W', true)
        expect(serial.text).toBe('one\ntWo')
    })
})

describe('Windows-1252', () => {
    it('decodes every byte as the Encoding Standard maps it', () => {
        const decoded = createTextStreamDecoder('windows-1252').decode(everyByte)
        expect(decoded).toBe(everyByteAsWindows1252())
    })

    it('encodes back to the same bytes', () => {
        expect(encodeText(everyByteAsWindows1252(), 'windows-1252')).toEqual(everyByte)
    })

    it('has no byte for a C1 control its typographic characters replace', () => {
        //0x80 is the euro sign, so U+0080 cannot be written
        expect(encodeText('\u0080€', 'windows-1252')).toEqual(Uint8Array.of(0x3f, 0x80))
        expect(encodeText('Ω', 'windows-1252')).toEqual(Uint8Array.of(0x3f))
    })
})

describe('Latin-1', () => {
    it('is one character per byte, both ways', () => {
        const decoded = createTextStreamDecoder('latin-1').decode(everyByte)
        expect([...decoded].map((character) => character.charCodeAt(0))).toEqual([...everyByte])
        expect(encodeText(decoded, 'latin-1')).toEqual(everyByte)
    })

    it('writes a character outside it as a question mark, whole', () => {
        expect(encodeText('a☃😀', 'latin-1')).toEqual(Uint8Array.of(0x61, 0x3f, 0x3f))
    })
})

describe('the UTF-8 stream decoder', () => {
    /** Every way of cutting `bytes` into two writes decodes to what one write does. */
    function splitsAgree(bytes: Uint8Array, encoding: TerminalEncoding = 'utf-8') {
        const whole = new TextDecoder().decode(bytes)
        for (let cut = 0; cut <= bytes.length; cut++) {
            const decoder = createTextStreamDecoder(encoding)
            const text =
                decoder.decode(bytes.subarray(0, cut)) +
                decoder.decode(bytes.subarray(cut)) +
                decoder.end()
            expect(text, `cut at ${cut}`).toBe(whole)
        }
    }

    it('decodes a character however the writes cut it', () => {
        splitsAgree(new TextEncoder().encode('aé€😀z'))
    })

    it('replaces invalid and truncated input the way one write would', () => {
        splitsAgree(Uint8Array.of(0x61, 0xe0, 0x80, 0x62, 0xf0, 0x9f, 0x63, 0xc3))
        splitsAgree(Uint8Array.of(0xed, 0xa0, 0x80, 0xff, 0xfe, 0xc0, 0xaf))
    })

    it('decodes a byte at a time, as x86 hands its output over', () => {
        const decoder = createTextStreamDecoder('utf-8')
        const source = 'hi é😀'
        let text = ''
        for (const byte of new TextEncoder().encode(source)) text += decoder.decode([byte])
        expect(text + decoder.end()).toBe(source)
    })

    it('keeps a byte order mark the program printed', () => {
        const decoder = createTextStreamDecoder('utf-8')
        expect(decoder.decode(Uint8Array.of(0xef, 0xbb, 0xbf, 0x41))).toBe('﻿A')
    })
})
