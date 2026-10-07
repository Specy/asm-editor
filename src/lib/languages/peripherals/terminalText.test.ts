import { describe, expect, it } from 'vitest'
import {
    createTextStreamDecoder,
    encodeText,
    terminalTextConventions,
    type TerminalEncoding
} from './terminalText'

const everyByte = Uint8Array.from({ length: 256 }, (_, byte) => byte)

describe('terminal text conventions', () => {
    it("follows each Target's Reference environment", () => {
        expect(terminalTextConventions('M68K')).toEqual({ encoding: 'windows-1252', enter: '\r' })
        expect(terminalTextConventions('Z80')).toEqual({ encoding: 'latin-1', enter: '\n' })
        for (const language of ['MIPS', 'RISC-V', 'RISC-V-64', 'X86'] as const) {
            expect(terminalTextConventions(language)).toEqual({ encoding: 'utf-8', enter: '\n' })
        }
    })
})

describe('Windows-1252', () => {
    it("decodes every byte as the platform's own decoder does", () => {
        const decoded = createTextStreamDecoder('windows-1252').decode(everyByte)
        expect(decoded).toBe(new TextDecoder('windows-1252').decode(everyByte))
    })

    it('encodes back to the same bytes', () => {
        const decoded = new TextDecoder('windows-1252').decode(everyByte)
        expect(encodeText(decoded, 'windows-1252')).toEqual(everyByte)
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
