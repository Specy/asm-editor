import type { AvailableLanguages } from '#lib/Project.svelte.ts'

/**
 * How a Target's text services turn characters into bytes and back, which the Terminal follows for
 * what a program writes as bytes and for the lines it hands to a byte read. Within a Target the
 * assembler's string literals and every text service share one encoding
 * ([environment-library.md](../../../../../../docs/design/environment-library.md), Text encoding):
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
    /**
     * Whether the Terminal is a serial line, x86's `ttyS0`
     * ([ADR 0068](../../../../../../docs/adr/0068-x86-programs-run-on-a-serial-console.md)), whose
     * output moves a cursor (`SerialTranscript`). Elsewhere the transcript is the text as written,
     * `\r` and `\b` included.
     */
    serialLine: boolean
}

/** The conventions of a Target's Reference environment, for the Terminal its Emulator builds. */
export function terminalTextConventions(language: AvailableLanguages): TerminalTextConventions {
    switch (language) {
        case 'M68K':
            return { encoding: 'windows-1252', enter: '\r', serialLine: false }
        case 'Z80':
            return { encoding: 'latin-1', enter: '\n', serialLine: false }
        case 'X86':
            return { encoding: 'utf-8', enter: '\n', serialLine: true }
        default:
            return { encoding: 'utf-8', enter: '\n', serialLine: false }
    }
}

const ESCAPE = '\x1b'
const BELL = '\x07'
const STRING_TERMINATOR = '\\'
/** The introducers of the control strings (OSC, DCS, SOS, PM, APC), which end at BEL or `ESC \`. */
const STRING_INTRODUCERS = new Set([']', 'P', 'X', '^', '_'])
/** What `escapeSequenceEnd` answers for a sequence the text ends before it is complete. */
export const INCOMPLETE_SEQUENCE = -1

/**
 * Where the escape sequence starting at `start` (an ESC) ends, or `INCOMPLETE_SEQUENCE` when the
 * text ends first: a CSI (`ESC [`), a control string ended by BEL or `ESC \`, or an ESC with its
 * intermediate and final bytes. A malformed sequence ends where it stops being one, so the
 * character that broke it is read again as text; an ESC that starts nothing is a sequence of its
 * own. Shared by the serial line's cursor, for which a sequence takes no column, and by the view
 * that draws x86's colours.
 */
export function escapeSequenceEnd(text: string, start: number): number {
    const introducer = text[start + 1]
    if (introducer === undefined) return INCOMPLETE_SEQUENCE
    if (introducer === '[') {
        let index = start + 2
        while (index < text.length && inRange(text, index, 0x30, 0x3f)) index++
        while (index < text.length && inRange(text, index, 0x20, 0x2f)) index++
        if (index >= text.length) return INCOMPLETE_SEQUENCE
        return inRange(text, index, 0x40, 0x7e) ? index + 1 : index
    }
    if (STRING_INTRODUCERS.has(introducer)) {
        for (let index = start + 2; index < text.length; index++) {
            if (text[index] === BELL) return index + 1
            if (text[index] !== ESCAPE) continue
            if (index + 1 >= text.length) return INCOMPLETE_SEQUENCE
            //an ESC ends the string either way: as its terminator, or by starting what comes next
            return text[index + 1] === STRING_TERMINATOR ? index + 2 : index
        }
        return INCOMPLETE_SEQUENCE
    }
    if (inRange(text, start + 1, 0x20, 0x2f)) {
        let index = start + 1
        while (index < text.length && inRange(text, index, 0x20, 0x2f)) index++
        if (index >= text.length) return INCOMPLETE_SEQUENCE
        return inRange(text, index, 0x30, 0x7e) ? index + 1 : index
    }
    if (inRange(text, start + 1, 0x30, 0x7e)) return start + 2
    return start + 1
}

function inRange(text: string, index: number, low: number, high: number): boolean {
    const code = text.charCodeAt(index)
    return code >= low && code <= high
}

/** Characters of the output that move the serial line's cursor rather than add to the line. */
const CURSOR_CONTROLS = /[\r\n\b]/

/**
 * The screen of a serial terminal kept as a transcript, x86's `ttyS0` (ADR 0068): what a program
 * writes moves a cursor, and only the last line is ever written into, because nothing moves the
 * cursor up.
 *
 * - `\r` takes the cursor back to the start of its line, and what comes next overwrites what is
 *   there, one character a column.
 * - `\b` takes it back a column, never past the start of the line.
 * - `\n` starts a new line after the whole of the current one: at its first column when the output
 *   is processed (`OPOST` and `ONLCR`, `\n` going out as `\r\n`), and otherwise below the column
 *   the cursor was in, the staircase a raw serial line shows.
 * - An escape sequence takes no column. Written at the end it is kept as written, for the view to
 *   draw; written inside the line it is kept until it is complete and then put where the cursor is.
 *   Overwriting steps over the sequences it meets, so a character written over another takes the
 *   colour that one had.
 *
 * Every other character takes one column, a tab and a wide character included, a documented
 * simplification. Output that only adds to the end, which is nearly all of it, is appended as the
 * other Targets' is, and the lines before the last are one string never written into again, so
 * overwriting costs the length of the last line, not of the transcript.
 */
export class SerialTranscript {
    /** Every line before the last, each with its line feed. */
    private head = ''
    /** The last line, the one the cursor is on. */
    private line = ''
    /** Where in `line` the next character goes. */
    private at = 0
    /** An escape sequence arriving while the cursor is inside the line, until it is complete. */
    private escape = ''

    constructor(text = '') {
        this.reset(text)
    }

    /** What the screen shows, line by line. */
    get text(): string {
        return this.head + this.line
    }

    /** Where the last line starts in `text`. */
    get lineStart(): number {
        return this.head.length
    }

    /** The last line, the only one writing can change. */
    get lastLine(): string {
        return this.line
    }

    /** Where in `text` the next character goes. */
    get cursor(): number {
        return this.head.length + this.at
    }

    /** The start of an escape sequence written inside the line and not complete yet. */
    get pendingEscape(): string {
        return this.escape
    }

    /** Whether writing `text` may change what is already written, rather than only add to it. */
    mayEdit(text: string): boolean {
        return this.at < this.line.length || this.escape !== '' || /[\r\b]/.test(text)
    }

    /** Writes `text` at the cursor; `newlineReturns` is whether `\n` also returns (`ONLCR`). */
    write(text: string, newlineReturns: boolean): void {
        if (this.at === this.line.length && this.escape === '' && !CURSOR_CONTROLS.test(text)) {
            this.line += text
            this.at = this.line.length
            return
        }
        for (const character of text) this.put(character, newlineReturns)
    }

    /**
     * Takes back `character` written just before the cursor, as a tty erases an echo: off the end
     * of the line, or by writing a space over it inside the line, which is the `\b \b` a tty
     * writes. False when the character is not there to take back.
     */
    erase(character: string): boolean {
        if (this.escape !== '' || !this.line.slice(0, this.at).endsWith(character)) return false
        if (this.at === this.line.length) {
            this.line = this.line.slice(0, -character.length)
            this.at = this.line.length
            return true
        }
        this.at -= character.length
        this.place(' ')
        this.at -= 1
        return true
    }

    /** Puts something before everything written so far, the cursor staying where it is. */
    prepend(text: string): void {
        this.reset(text + this.text, text.length + this.cursor, this.escape)
    }

    /** Starts again from `text`, with the cursor at `cursor` on its last line, for Undo and clear. */
    reset(text = '', cursor = text.length, escape = ''): void {
        const start = text.lastIndexOf('\n') + 1
        this.head = text.slice(0, start)
        this.line = text.slice(start)
        this.at = Math.min(Math.max(cursor - start, 0), this.line.length)
        this.escape = escape
    }

    private put(character: string, newlineReturns: boolean): void {
        if (this.escape !== '') {
            this.escape += character
            const end = escapeSequenceEnd(this.escape, 0)
            if (end === INCOMPLETE_SEQUENCE) return
            const sequence = this.escape.slice(0, end)
            const rest = this.escape.slice(end)
            this.escape = ''
            this.line = this.line.slice(0, this.at) + sequence + this.line.slice(this.at)
            this.at += sequence.length
            //the character that broke a malformed sequence is text
            for (const next of rest) this.put(next, newlineReturns)
            return
        }
        switch (character) {
            case '\r':
                this.at = 0
                return
            case '\b':
                this.at = this.previousColumnStart()
                return
            case '\n': {
                const column = newlineReturns ? 0 : this.columnAt(this.at)
                this.head += `${this.line}\n`
                this.line = ' '.repeat(column)
                this.at = column
                return
            }
            case ESCAPE:
                if (this.at < this.line.length) {
                    this.escape = character
                    return
                }
        }
        this.place(character)
    }

    /** Writes one character into the column at the cursor, or after the end of the line. */
    private place(character: string): void {
        while (this.at < this.line.length && this.line[this.at] === ESCAPE) {
            const end = escapeSequenceEnd(this.line, this.at)
            this.at = end === INCOMPLETE_SEQUENCE ? this.line.length : end
        }
        if (this.at === this.line.length) {
            this.line += character
            this.at = this.line.length
            return
        }
        const replaced = codePointLength(this.line, this.at)
        this.line = this.line.slice(0, this.at) + character + this.line.slice(this.at + replaced)
        this.at += character.length
    }

    /** How many columns the characters of the line before `index` take. */
    private columnAt(index: number): number {
        let column = 0
        for (let at = 0; at < index;) {
            if (this.line[at] === ESCAPE) {
                at = this.sequenceEnd(at, index)
                continue
            }
            at += codePointLength(this.line, at)
            column++
        }
        return column
    }

    /** Where the column before the cursor starts, or the cursor itself at the first column. */
    private previousColumnStart(): number {
        let previous = this.at
        for (let at = 0; at < this.at;) {
            if (this.line[at] === ESCAPE) {
                at = this.sequenceEnd(at, this.at)
                continue
            }
            previous = at
            at += codePointLength(this.line, at)
        }
        return previous
    }

    /** The end of the sequence at `at` in the line, never past `limit`. */
    private sequenceEnd(at: number, limit: number): number {
        const end = escapeSequenceEnd(this.line, at)
        return end === INCOMPLETE_SEQUENCE ? limit : Math.min(end, limit)
    }
}

/** 2 for a surrogate pair, a character outside the Basic Multilingual Plane, else 1. */
function codePointLength(text: string, index: number): number {
    const code = text.charCodeAt(index)
    return code >= 0xd800 && code <= 0xdbff && index + 1 < text.length ? 2 : 1
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
    /** The bytes held back for a character still incomplete, empty when there are none. */
    held(): Uint8Array
    /** Holds back `bytes` again, as `held` gave them, for Undo. */
    hold(bytes: Uint8Array): void
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
/** A single-byte encoding never holds a byte back. */
const NOTHING_HELD = new Uint8Array(0)

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

    held(): Uint8Array {
        return NOTHING_HELD
    }

    hold(): void {}
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

    //`pending` is replaced, never written into, so handing it out is safe
    held(): Uint8Array {
        return this.pending
    }

    hold(bytes: Uint8Array): void {
        this.pending = bytes
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
