/**
 * The escape sequences of an x86 program's output, read for the Terminal's view alone
 * ([ADR 0036](../../../../../../docs/adr/0036-programs-read-input-typed-in-the-terminal.md)): the
 * transcript keeps every byte the program wrote, so a Testcase compares exactly that, and only what
 * the console draws changes.
 *
 * What is interpreted:
 *
 * - SGR (`ESC[…m`): reset (0 or no parameter), bold (1, cleared by 22), the eight colours and their
 *   bright forms as foreground (30–37, 90–97) and background (40–47, 100–107), and the defaults (39,
 *   49). Other attributes, the 256-colour and RGB forms included, are read and ignored.
 * - Clear screen: `ESC[2J`, `ESC[3J` and `ESC c` (which also resets the colours), and `ESC[J` right
 *   after a cursor home, the `ESC[H ESC[J` spelling of the same thing.
 * - Cursor home (`ESC[H`, `ESC[1;1H`, `ESC[f`) is dropped: it is half of the usual clear and moves
 *   nothing in a transcript that only grows.
 *
 * Every other complete sequence is shown, escaped, as the program wrote it (`␛[5;10H`), so cursor
 * addressing, the documented deviation, is visible rather than silently lost. A sequence still
 * incomplete at the end of the output is shown the same way until the rest of it arrives.
 *
 * Plain TypeScript, so it runs under node in the tests.
 */

import { escapeSequenceEnd, INCOMPLETE_SEQUENCE } from '#lib/languages/peripherals/terminalText.ts'

/** One of the sixteen colours: 0–7 as SGR 30–37 name them, 8–15 their bright forms. */
export type TerminalColor = number

export type TerminalStyle = {
    readonly foreground: TerminalColor | null
    readonly background: TerminalColor | null
    readonly bold: boolean
}

export type TerminalSpan =
    | { readonly kind: 'text'; readonly text: string; readonly style: TerminalStyle }
    /** A sequence the view does not interpret, with its control characters made visible. */
    | { readonly kind: 'escape'; readonly text: string }

export const PLAIN_STYLE: TerminalStyle = { foreground: null, background: null, bold: false }

const ESCAPE = '\x1b'

/**
 * A parser's state, which `restore` takes it back to. Kept cheaply: what is on screen only grows at
 * its end, its last span replaced as text is added to it, or starts again from nothing at a clear,
 * so the spans up to the mark are the array as it was, cut back to its length with its last span
 * put back.
 */
export type TerminalParserMark = {
    readonly committed: TerminalSpan[]
    readonly length: number
    readonly last: TerminalSpan | undefined
    readonly style: TerminalStyle
    readonly pending: string
    readonly homed: boolean
}

/**
 * Reads output as it streams: `feed` takes what was written since, and a sequence split between two
 * writes is held back until it is complete. `spans` are what is on screen since the last clear.
 */
export class TerminalEscapeParser {
    private committed: TerminalSpan[] = []
    private style: TerminalStyle = PLAIN_STYLE
    /** An incomplete sequence at the end of what was fed. */
    private pending = ''
    /** Whether the cursor was sent home and nothing was written since, see `ESC[J`. */
    private homed = false

    feed(text: string): void {
        const input = this.pending + text
        this.pending = ''
        let index = 0
        while (index < input.length) {
            const escape = input.indexOf(ESCAPE, index)
            if (escape === -1) {
                this.appendText(input.slice(index))
                return
            }
            if (escape > index) this.appendText(input.slice(index, escape))
            const end = escapeSequenceEnd(input, escape)
            if (end === INCOMPLETE_SEQUENCE) {
                this.pending = input.slice(escape)
                return
            }
            this.apply(input.slice(escape, end))
            index = end
        }
    }

    /** The parser as it is now, for `restore`. */
    mark(): TerminalParserMark {
        const committed = this.committed
        return {
            committed,
            length: committed.length,
            last: committed[committed.length - 1],
            style: this.style,
            pending: this.pending,
            homed: this.homed
        }
    }

    /** Back to a `mark` of this parser; any of its marks, as often as needed. */
    restore(mark: TerminalParserMark): void {
        const committed = mark.committed
        committed.length = mark.length
        if (mark.last !== undefined) committed[mark.length - 1] = mark.last
        this.committed = committed
        this.style = mark.style
        this.pending = mark.pending
        this.homed = mark.homed
    }

    /** What is on screen, a sequence still being written shown escaped at the end. */
    get spans(): TerminalSpan[] {
        if (this.pending.length === 0) return [...this.committed]
        return [...this.committed, escapeSpan(this.pending)]
    }

    private appendText(text: string): void {
        if (text.length === 0) return
        this.homed = false
        const last = this.committed[this.committed.length - 1]
        if (last?.kind === 'text' && last.style === this.style) {
            this.committed[this.committed.length - 1] = {
                kind: 'text',
                text: last.text + text,
                style: this.style
            }
            return
        }
        this.committed.push({ kind: 'text', text, style: this.style })
    }

    private apply(sequence: string): void {
        if (sequence === `${ESCAPE}c`) {
            this.style = PLAIN_STYLE
            this.clear()
            return
        }
        const csi = parseControlSequence(sequence)
        if (csi) {
            if (csi.final === 'm') {
                this.style = applySgr(this.style, csi.parameters)
                return
            }
            if (csi.final === 'J' && (csi.parameters === '2' || csi.parameters === '3')) {
                this.clear()
                return
            }
            if (csi.final === 'J' && (csi.parameters === '' || csi.parameters === '0')) {
                if (this.homed) {
                    this.clear()
                    return
                }
            }
            if ((csi.final === 'H' || csi.final === 'f') && isHome(csi.parameters)) {
                this.homed = true
                return
            }
        }
        this.committed.push(escapeSpan(sequence))
    }

    private clear(): void {
        this.committed = []
        this.homed = true
    }
}

/** Everything of a whole transcript that is on screen, for a view that does not stream. */
export function parseTerminalEscapes(text: string): TerminalSpan[] {
    const parser = new TerminalEscapeParser()
    parser.feed(text)
    return parser.spans
}

/**
 * Follows a transcript that is handed over whole each time it changes: what was added since the
 * last call is all that is parsed while the transcript only grows, as it does while a program
 * writes. A change within the last line, a serial line's `\r` or `\b` overwriting it or Backspace
 * taking back an echo, is read again from where that line starts, so a progress counter costs a
 * line each time and not the whole transcript; anything else (a cleared or prefixed transcript, an
 * Undo of earlier lines) starts over from the beginning.
 */
export class TerminalTranscriptReader {
    private parser = new TerminalEscapeParser()
    private read = ''
    /** Where the last line read starts, and the parser as it was there. */
    private lineStart: { offset: number; mark: TerminalParserMark } | null = null

    spansOf(transcript: string): TerminalSpan[] {
        if (!transcript.startsWith(this.read)) this.rewind(transcript)
        if (transcript.length > this.read.length) {
            const added = transcript.slice(this.read.length)
            const newline = added.lastIndexOf('\n')
            if (newline === -1) this.parser.feed(added)
            else {
                this.parser.feed(added.slice(0, newline + 1))
                const offset = this.read.length + newline + 1
                this.lineStart = { offset, mark: this.parser.mark() }
                this.parser.feed(added.slice(newline + 1))
            }
            this.read = transcript
        }
        return this.parser.spans
    }

    /** Back to the start of the last line when the transcript still has every line before it. */
    private rewind(transcript: string): void {
        const start = this.lineStart
        if (start && transcript.startsWith(this.read.slice(0, start.offset))) {
            this.parser.restore(start.mark)
            this.read = this.read.slice(0, start.offset)
            return
        }
        this.parser = new TerminalEscapeParser()
        this.read = ''
        this.lineStart = null
    }
}

/** The class names a span's style is drawn with, `fg-1 bg-12 bold`, or an empty string. */
export function styleClasses(style: TerminalStyle): string {
    const classes: string[] = []
    if (style.foreground !== null) classes.push(`fg-${style.foreground}`)
    if (style.background !== null) classes.push(`bg-${style.background}`)
    if (style.bold) classes.push('bold')
    return classes.join(' ')
}

/** A complete CSI sequence without intermediate bytes, the only ones interpreted. */
function parseControlSequence(sequence: string): { parameters: string; final: string } | null {
    if (sequence[1] !== '[' || sequence.length < 3) return null
    const final = sequence[sequence.length - 1]
    const parameters = sequence.slice(2, -1)
    if (!/^[0-9;:]*$/.test(parameters)) return null
    if (!/^[\x40-\x7e]$/.test(final)) return null
    return { parameters, final }
}

/** Row 1, column 1, however it is spelled: `H`, `1;1H`, `;H`, `1H`. */
function isHome(parameters: string): boolean {
    return parameters.split(';').every((value) => value === '' || Number(value) === 1)
}

/**
 * The style after an SGR sequence's parameters, in order. An empty parameter is 0. The 256-colour
 * and RGB forms (38 and 48, with `;` or `:`) are skipped whole, so their numbers are not misread
 * as attributes of their own.
 */
function applySgr(style: TerminalStyle, parameters: string): TerminalStyle {
    const values = parameters.split(';')
    let { foreground, background, bold } = style
    for (let index = 0; index < values.length; index++) {
        const value = values[index]
        const code = value === '' ? 0 : Number(value.split(':')[0])
        if (code === 38 || code === 48) {
            //the colon form carries its arguments in the same parameter
            if (value.includes(':')) continue
            const form = Number(values[index + 1])
            index += form === 5 ? 2 : form === 2 ? 4 : 1
            continue
        }
        if (code === 0) {
            foreground = null
            background = null
            bold = false
        } else if (code === 1) bold = true
        else if (code === 22) bold = false
        else if (code >= 30 && code <= 37) foreground = code - 30
        else if (code === 39) foreground = null
        else if (code >= 40 && code <= 47) background = code - 40
        else if (code === 49) background = null
        else if (code >= 90 && code <= 97) foreground = code - 90 + 8
        else if (code >= 100 && code <= 107) background = code - 100 + 8
    }
    if (foreground === style.foreground && background === style.background && bold === style.bold) {
        return style
    }
    if (foreground === null && background === null && !bold) return PLAIN_STYLE
    return { foreground, background, bold }
}

/** A sequence as text, its control characters drawn as their Unicode control pictures (`␛`). */
function escapeSpan(sequence: string): TerminalSpan {
    return { kind: 'escape', text: visibleControls(sequence) }
}

function visibleControls(text: string): string {
    let visible = ''
    for (const character of text) {
        const code = character.charCodeAt(0)
        if (code < 0x20) visible += String.fromCharCode(0x2400 + code)
        else if (code === 0x7f) visible += '␡'
        else visible += character
    }
    return visible
}
