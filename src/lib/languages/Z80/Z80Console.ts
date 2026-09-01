import { Z80_PORTS, type Z80PortName } from '$lib/languages/Z80/Z80-model'

/**
 * The console device sitting on the Z80's IO bus. A Z80 has no system calls, so everything a
 * program prints or reads goes through `in`/`out` on one of the ports described by `Z80_PORTS`;
 * this class is the whole device, and the only thing the emulator adapter has to do is hand it the
 * bus address the CPU put out and, when a read cannot be served yet, a line of input.
 *
 * It is deliberately plain TypeScript (no Svelte state, no imports from the rest of the app): the
 * machine calls into it from inside `run()`, which must stay synchronous, and it can be exercised
 * from a node probe.
 */

/** What the device prints. The adapter passes the terminal peripheral's `write`. */
export type Z80ConsoleWriter = (text: string) => void

/** An `in` from a port with nothing attached reads an empty bus, which floats high. */
export const Z80_UNCONNECTED_PORT_VALUE = 0xff

export const INVALID_NUMBER_ERROR = 'Invalid number'
export const INVALID_HEX_NUMBER_ERROR = 'Invalid hex number'

const READ_LINE_QUESTION = 'Enter a line of text'
const READ_NUMBER_QUESTION = 'Enter a number'
const READ_HEX_QUESTION = 'Enter a hexadecimal number'

/**
 * A character the terminal cannot deliver as a single byte (anything outside Latin-1, which is what
 * a `.byte` of Z80 memory can hold) is handed to the program as a question mark instead of being
 * silently split into surrogate halves.
 */
const UNREPRESENTABLE_CHARACTER = 0x3f

const PORT_NAME_BY_NUMBER = new Map<number, Z80PortName>(
    Object.entries(Z80_PORTS).map(([name, port]) => [port, name as Z80PortName])
)

export class Z80Console {
    private readonly writeOut: Z80ConsoleWriter
    /** Bytes of the current input line still to be handed to the character port, in order. */
    private readonly characterInput: number[] = []
    /**
     * The byte parsed out of the last line typed for a numeric port. The numeric ports need a whole
     * line per read, so the `in` that asked for it is rolled back by the machine and re-executed
     * once the line has been parsed: this holds the answer for that second attempt.
     */
    private pendingNumber: number | undefined

    constructor(write: Z80ConsoleWriter) {
        this.writeOut = write
    }

    /** The console port the CPU addressed, or undefined when nothing is attached there. */
    static portNameOf(busAddress: number): Z80PortName | undefined {
        return PORT_NAME_BY_NUMBER.get(busAddress & 0xff)
    }

    /**
     * Serves an `in`. Returning undefined means "no data yet": the machine rolls the instruction
     * back and stops with `WAITING_FOR_INPUT`, so the adapter can ask the user for a line and
     * resume, at which point this is called again for the same port.
     */
    readPort(busAddress: number): number | undefined {
        switch (Z80Console.portNameOf(busAddress)) {
            case 'CHAR':
                return this.characterInput.shift()
            case 'NUMBER':
            case 'SIGNED':
            case 'HEX':
            case 'WORD': {
                const value = this.pendingNumber
                this.pendingNumber = undefined
                return value
            }
            default:
                return Z80_UNCONNECTED_PORT_VALUE
        }
    }

    /** Serves an `out`. Writes to a port with nothing attached are dropped, like a real bus. */
    writePort(busAddress: number, value: number): void {
        const byte = value & 0xff
        switch (Z80Console.portNameOf(busAddress)) {
            case 'CHAR':
                this.writeOut(String.fromCharCode(byte))
                return
            case 'NUMBER':
                this.writeOut(String(byte))
                return
            case 'SIGNED':
                //the byte is a two's complement number, -128 to 127
                this.writeOut(String((byte << 24) >> 24))
                return
            case 'HEX':
                this.writeOut(byte.toString(16).toUpperCase().padStart(2, '0'))
                return
            case 'WORD':
                //the high byte of the 16 bit value rides on the high byte of the address bus, which
                //`out (c),r` fills from B — the only port that looks at more than the port number
                this.writeOut(String((((busAddress >> 8) & 0xff) << 8) | byte))
                return
            default:
                return
        }
    }

    /** The prompt to show for the port an `in` is waiting on. */
    inputQuestion(busAddress: number): string {
        switch (Z80Console.portNameOf(busAddress)) {
            case 'CHAR':
                return READ_LINE_QUESTION
            case 'HEX':
                return READ_HEX_QUESTION
            default:
                return READ_NUMBER_QUESTION
        }
    }

    /**
     * Hands the device the line that was typed for the port an `in` is waiting on. Throws when the
     * line does not parse, which stops the program with that message.
     */
    provideInput(busAddress: number, line: string): void {
        switch (Z80Console.portNameOf(busAddress)) {
            case 'CHAR':
                this.bufferLine(line)
                return
            case 'HEX':
                this.pendingNumber = parseHexByte(line)
                return
            default:
                //every other console port reads decimal; an unconnected port never waits for input
                this.pendingNumber = parseDecimalByte(line)
                return
        }
    }

    /** Drops everything buffered, for a machine that is being restarted. */
    reset(): void {
        this.characterInput.length = 0
        this.pendingNumber = undefined
    }

    /**
     * The character port hands out one byte at a time and the line always ends with a newline, so a
     * program can read until it sees 0x0A instead of having to be told how long the line is.
     */
    private bufferLine(line: string): void {
        for (const character of line) {
            const code = character.codePointAt(0) ?? UNREPRESENTABLE_CHARACTER
            this.characterInput.push(code > 0xff ? UNREPRESENTABLE_CHARACTER : code)
        }
        this.characterInput.push(0x0a)
    }
}

/**
 * Only the low byte of the parsed value can be returned: `in` reads 8 bits. A number too big for a
 * byte is truncated rather than rejected, the same way `ld a, 300` would be.
 */
function parseDecimalByte(line: string): number {
    const text = line.trim()
    if (!/^[+-]?\d+$/.test(text)) throw new Error(INVALID_NUMBER_ERROR)
    return Number(text) & 0xff
}

function parseHexByte(line: string): number {
    const text = line.trim()
    const match = /^(?:0x|\$)?([0-9a-f]+)h?$/i.exec(text)
    if (!match) throw new Error(INVALID_HEX_NUMBER_ERROR)
    return Number.parseInt(match[1], 16) & 0xff
}
