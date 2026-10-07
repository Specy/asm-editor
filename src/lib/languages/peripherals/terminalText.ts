import type { AvailableLanguages } from '$lib/Project.svelte'

/**
 * How a Target's text services turn characters into bytes and back, which the Terminal follows for
 * what a program writes as bytes and for the lines it hands to a byte read. Within a Target the
 * assembler's string literals and every text service share one encoding
 * ([environment-library.md](../../../../docs/design/environment-library.md), Text encoding):
 *
 * - UTF-8 for MIPS, RISC-V and x86, a documented deviation for MIPS, whose MARS prints one byte per
 *   character;
 * - Windows-1252 for the M68K, as EASy68K;
 * - Latin-1 for the Z80, one byte per character, its Port map being its own reference.
 *
 * Plain TypeScript, like the other peripherals, so it runs under node in the tests.
 */
export type TerminalEncoding = 'utf-8' | 'windows-1252' | 'latin-1'

/**
 * What a character read gives for Enter, the Reference environment's code: a line feed (10) for
 * MARS, RARS, Linux and the Z80's console port, a carriage return (`$0D`) for EASy68K's task 5. A
 * line read never sees it: Enter ends the line, which a byte read follows with a line feed.
 */
export type TerminalEnter = '\n' | '\r'

export type TerminalTextConventions = {
    encoding: TerminalEncoding
    enter: TerminalEnter
}

/** The conventions of a Target's Reference environment, for the Terminal its Emulator builds. */
export function terminalTextConventions(language: AvailableLanguages): TerminalTextConventions {
    switch (language) {
        case 'M68K':
            return { encoding: 'windows-1252', enter: '\r' }
        case 'Z80':
            return { encoding: 'latin-1', enter: '\n' }
        default:
            return { encoding: 'utf-8', enter: '\n' }
    }
}

/**
 * Turns a program's output bytes into text as they arrive. A character can be split across two
 * writes, a UTF-8 `é` written one byte per system call, so an incomplete one is held back until the
 * rest of it comes; `end` gives up on it, as a replacement character, when the program terminates.
 */
export type TextStreamDecoder = {
    decode(bytes: ArrayLike<number>): string
    /** The end of the stream: a character still incomplete becomes U+FFFD. */
    end(): string
    /** Forgets anything held back, for output that was cleared. */
    reset(): void
}

export function createTextStreamDecoder(encoding: TerminalEncoding): TextStreamDecoder {
    switch (encoding) {
        case 'utf-8':
            return new Utf8StreamDecoder()
        case 'windows-1252':
            return new SingleByteDecoder(WINDOWS_1252_DECODE)
        case 'latin-1':
            return new SingleByteDecoder(null)
    }
}

/**
 * Encodes text in a Target's encoding, for a line handed to a program as bytes. A character the
 * encoding has no byte for becomes a question mark, the substitution the Z80's console port has
 * always made, rather than being split or dropped.
 */
export function encodeText(text: string, encoding: TerminalEncoding): Uint8Array {
    if (encoding === 'utf-8') return utf8Encoder.encode(text)
    const bytes: number[] = []
    for (const character of text) {
        const code = character.codePointAt(0) ?? UNREPRESENTABLE_BYTE
        bytes.push(encoding === 'latin-1' ? latin1Byte(code) : windows1252Byte(code))
    }
    return Uint8Array.from(bytes)
}

/** A question mark, for a character the encoding cannot hold in a byte. */
const UNREPRESENTABLE_BYTE = 0x3f

const utf8Encoder = new TextEncoder()

function latin1Byte(code: number): number {
    return code <= 0xff ? code : UNREPRESENTABLE_BYTE
}

function windows1252Byte(code: number): number {
    const high = WINDOWS_1252_ENCODE.get(code)
    if (high !== undefined) return high
    //`0x80`–`0x9F` are the typographic characters, so the C1 controls they replace have no byte
    return code < 0x80 || (code >= 0xa0 && code <= 0xff) ? code : UNREPRESENTABLE_BYTE
}

/**
 * Windows-1252's bytes `0x80`–`0x9F` as the WHATWG Encoding Standard maps them, which is what a
 * browser's `TextDecoder('windows-1252')` does: 27 typographic characters, and the five bytes the
 * code page leaves undefined as the C1 control of the same number. Every other byte is Latin-1.
 */
const WINDOWS_1252_HIGH = [
    0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039,
    0x0152, 0x008d, 0x017d, 0x008f, 0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
    0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178
]

const WINDOWS_1252_DECODE: string[] = Array.from({ length: 256 }, (_, byte) =>
    String.fromCodePoint(byte >= 0x80 && byte < 0xa0 ? WINDOWS_1252_HIGH[byte - 0x80] : byte)
)

/** The code points of `0x80`–`0x9F` back to their byte; any other is Latin-1 or `?`. */
const WINDOWS_1252_ENCODE = new Map<number, number>(
    WINDOWS_1252_HIGH.map((code, index) => [code, 0x80 + index])
)

/** Every byte is a character of its own, so nothing is ever held back. */
class SingleByteDecoder implements TextStreamDecoder {
    private readonly table: string[] | null

    constructor(table: string[] | null) {
        this.table = table
    }

    decode(bytes: ArrayLike<number>): string {
        let text = ''
        for (let index = 0; index < bytes.length; index++) {
            const byte = bytes[index] & 0xff
            text += this.table === null ? String.fromCharCode(byte) : this.table[byte]
        }
        return text
    }

    end(): string {
        return ''
    }

    reset(): void {}
}

/**
 * UTF-8 with an incomplete character at the end of a write held back for the next one. The bytes
 * before it are decoded by the platform's decoder, so invalid input gets the replacement
 * characters the Encoding Standard prescribes; a held-back start that turns out to be invalid gets
 * them as soon as the bytes after it arrive, or at the end.
 */
class Utf8StreamDecoder implements TextStreamDecoder {
    //`ignoreBOM`: a byte order mark the program printed is output like any other character
    private readonly decoder = new TextDecoder('utf-8', { ignoreBOM: true })
    private pending: Uint8Array = new Uint8Array(0)

    decode(bytes: ArrayLike<number>): string {
        //the common case: x86 hands its output over a byte at a time, mostly ASCII
        if (this.pending.length === 0 && bytes.length === 1 && bytes[0] < 0x80) {
            return String.fromCharCode(bytes[0])
        }
        const all = new Uint8Array(this.pending.length + bytes.length)
        all.set(this.pending)
        for (let index = 0; index < bytes.length; index++) {
            all[this.pending.length + index] = bytes[index] & 0xff
        }
        const cut = incompleteTailStart(all)
        this.pending = all.slice(cut)
        return cut === 0 ? '' : this.decoder.decode(all.subarray(0, cut))
    }

    end(): string {
        const rest = this.pending
        this.pending = new Uint8Array(0)
        return rest.length === 0 ? '' : this.decoder.decode(rest)
    }

    reset(): void {
        this.pending = new Uint8Array(0)
    }
}

/**
 * Where the last character of `bytes` starts if it is still missing bytes, or `bytes.length` when
 * it is complete or cannot be completed. A UTF-8 character is at most four bytes, so only the last
 * three can belong to one that is still waiting for more.
 */
function incompleteTailStart(bytes: Uint8Array): number {
    const end = bytes.length
    for (let index = end - 1; index >= Math.max(0, end - 3); index--) {
        const byte = bytes[index]
        //a continuation byte: its lead is further back
        if ((byte & 0xc0) === 0x80) continue
        return end - index < utf8SequenceLength(byte) ? index : end
    }
    return end
}

/** How many bytes a sequence starting with this byte has; 1 for a byte that cannot start one. */
function utf8SequenceLength(lead: number): number {
    if (lead >= 0xc2 && lead <= 0xdf) return 2
    if (lead >= 0xe0 && lead <= 0xef) return 3
    if (lead >= 0xf0 && lead <= 0xf4) return 4
    return 1
}
