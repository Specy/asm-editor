import type { Keyboard } from '$lib/languages/peripherals/Keyboard'
import type { Mouse, MouseSnapshot } from '$lib/languages/peripherals/Mouse'
import type { ScreenColor } from '$lib/languages/peripherals/screen/color'
import type { Screen } from '$lib/languages/peripherals/screen/Screen'
import { echoToScreen } from '$lib/languages/peripherals/screen/textEcho'
import {
    Z80_MOUSE_FLAGS,
    Z80_MOUSE_VIEWS,
    Z80_PORTS,
    Z80_SCREEN_COMMANDS,
    Z80_SCREEN_MAX_SIZE,
    type Z80PortGroup,
    type Z80PortName,
    z80PortGroupOf
} from '$lib/languages/Z80/Z80-model'

/**
 * The device sitting on the Z80's IO bus: the whole port map of `Z80_PORTS`, which is the whole
 * interface a Z80 program has to the outside world. A Z80 has no system calls, so the Terminal, the
 * Screen, the Keyboard, the Mouse and program time are all reached with `in`/`out`
 * ([ADR 0002](../../../../docs/adr/0002-z80-console-ports.md),
 * [ADR 0011](../../../../docs/adr/0011-z80-peripherals-through-the-port-map.md)). The adapter hands
 * this class the bus address the CPU put out and, when a read cannot be served yet, the input line
 * or the wait it was waiting for.
 *
 * It is deliberately plain TypeScript (no Svelte state, no reactive dependencies): the machine calls
 * into it from inside `run()`, which must stay synchronous, and it has to be exercisable from node.
 * Everything asynchronous — asking the Terminal for input, letting a wait elapse — belongs to the
 * adapter, which is why a read that cannot be answered yet returns undefined instead of blocking.
 */

/** What the device prints. The adapter passes the Terminal peripheral's `write`. */
export type Z80ConsoleWriter = (text: string) => void

/** Everything the device needs from the Emulator's peripherals. */
export type Z80DeviceHost = {
    write: Z80ConsoleWriter
    /**
     * Whether a Terminal read would find an answer waiting, for the keyboard availability port. It
     * goes through the Terminal rather than straight to the Keyboard so that a poll and the read
     * that follows it refer to the same pending input, scripted testcase input included
     * ([ADR 0009](../../../../docs/adr/0009-share-screen-keyboard-input-with-terminal.md)).
     */
    hasInput: () => boolean
    /** Hundredths of a second since the run started, from the ProgramClock in use. */
    timeHundredths: () => number
    screen: Screen
    keyboard: Keyboard
    mouse: Mouse
    /**
     * Called the first time the program touches a Screen, Keyboard or Mouse port, which is what
     * makes a run graphical: from there on the Terminal answers its reads from the Screen's Keyboard
     * instead of from a prompt (ADR 0009). Programs that only ever print keep the prompt they always
     * had.
     */
    onGraphicalUse?: () => void
}

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

export class Z80Device {
    private readonly host: Z80DeviceHost
    /** Bytes of the current input line still to be handed to the character port, in order. */
    private readonly characterInput: number[] = []
    /**
     * The byte parsed out of the last line typed for a numeric port. The numeric ports need a whole
     * line per read, so the `in` that asked for it is rolled back by the machine and re-executed
     * once the line has been parsed: this holds the answer for that second attempt.
     */
    private pendingNumber: number | undefined
    /**
     * The coordinates a drawing command reads. They are staging registers, not the Screen's own
     * drawing position: a program sets them with `out` and then writes one command, and reading one
     * back answers the byte it last wrote.
     */
    private x = 0
    private y = 0
    private x2 = 0
    private y2 = 0
    private lastCommand = 0
    /**
     * The wait ports an `in` may now answer: the adapter puts the port here once the clock has
     * granted the wait, and the re-executed `in` takes it out again. Without it the resumed
     * instruction would ask for another wait and the program would never move.
     */
    private readonly servedWaits = new Set<Z80PortName>()
    private graphical = false

    constructor(host: Z80DeviceHost) {
        this.host = host
    }

    /** Drawing parameters staged in IO ports participate in instruction undo too. */
    drawingState() {
        return { x: this.x, y: this.y, x2: this.x2, y2: this.y2, lastCommand: this.lastCommand }
    }

    restoreDrawingState(state: ReturnType<Z80Device['drawingState']>): void {
        Object.assign(this, state)
    }

    /** The port the CPU addressed, or undefined when nothing is attached there. */
    static portNameOf(busAddress: number): Z80PortName | undefined {
        return PORT_NAME_BY_NUMBER.get(busAddress & 0xff)
    }

    /** Which peripheral a bus address decodes to, for an adapter that has to route a pending read. */
    static groupOf(busAddress: number): Z80PortGroup | undefined {
        const name = Z80Device.portNameOf(busAddress)
        return name === undefined ? undefined : z80PortGroupOf(name)
    }

    /** Whether an `in` on this address is a wait rather than a request for input. */
    static isWaitPort(busAddress: number): boolean {
        const name = Z80Device.portNameOf(busAddress)
        return name === 'TIME_WAIT' || name === 'TIME_FRAME'
    }

    /** Whether a suspended `in` on this address wants one character rather than a whole line. */
    static isCharacterPort(busAddress: number): boolean {
        return Z80Device.portNameOf(busAddress) === 'CHAR'
    }

    /**
     * How long a wait on this address is, in hundredths of a second: the parameter register B, which
     * `in r,(c)` drives onto the high byte of the address bus. The frame-sync port has no duration.
     */
    static waitHundredthsOf(busAddress: number): number {
        return parameterOf(busAddress)
    }

    /**
     * Serves an `in`. Returning undefined means "no data yet": the machine rolls the instruction
     * back and stops with `WAITING_FOR_INPUT`, so the adapter can ask the user for a line or let a
     * wait elapse and resume, at which point this is called again for the same port.
     */
    readPort(busAddress: number): number | undefined {
        const name = Z80Device.portNameOf(busAddress)
        if (name === undefined) return Z80_UNCONNECTED_PORT_VALUE
        this.noticeGraphicalUse(name)
        const screen = this.host.screen
        const parameter = parameterOf(busAddress)
        switch (name) {
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
            case 'SCREEN_PEN_COLOR':
                return packColor(screen.penColor)
            case 'SCREEN_FILL_COLOR':
                return packColor(screen.fillColor)
            case 'SCREEN_PEN_WIDTH':
                return screen.penWidth & 0xff
            case 'SCREEN_X':
                return this.x
            case 'SCREEN_Y':
                return this.y
            case 'SCREEN_X2':
                return this.x2
            case 'SCREEN_Y2':
                return this.y2
            case 'SCREEN_COMMAND':
                return this.lastCommand
            case 'SCREEN_PIXEL':
                return packColor(screen.getPixel(this.x, this.y))
            case 'SCREEN_CURSOR_COLUMN':
                return screen.cursorColumn & 0xff
            case 'SCREEN_CURSOR_ROW':
                return screen.cursorRow & 0xff
            case 'KEY_AVAILABLE':
                return this.host.hasInput() ? 1 : 0
            case 'KEY_STATE':
                return this.host.keyboard.isKeyDown(parameter) ? 1 : 0
            case 'KEY_LAST_DOWN':
                return this.host.keyboard.lastKeys().down & 0xff
            case 'KEY_LAST_UP':
                return this.host.keyboard.lastKeys().up & 0xff
            case 'MOUSE_X':
                return this.mouseView(parameter).x & 0xff
            case 'MOUSE_Y':
                return this.mouseView(parameter).y & 0xff
            case 'MOUSE_BUTTONS':
                return mouseFlags(this.mouseView(parameter))
            case 'MOUSE_EVENTS':
                return this.mouseView(parameter).event & 0xff
            case 'TIME_WAIT':
            case 'TIME_FRAME':
                //the wait itself is the adapter's: it stops the slice, asks the clock and comes back
                return this.servedWaits.delete(name) ? 0 : undefined
            case 'TIME_NOW':
                return timeByte(this.host.timeHundredths(), parameter)
        }
    }

    /** Serves an `out`. Writes to a port with nothing attached are dropped, like a real bus. */
    writePort(busAddress: number, value: number): void {
        const name = Z80Device.portNameOf(busAddress)
        if (name === undefined) return
        this.noticeGraphicalUse(name)
        const screen = this.host.screen
        const byte = value & 0xff
        switch (name) {
            case 'CHAR':
                this.print(String.fromCharCode(byte))
                return
            case 'NUMBER':
                this.print(String(byte))
                return
            case 'SIGNED':
                //the byte is a two's complement number, -128 to 127
                this.print(String((byte << 24) >> 24))
                return
            case 'HEX':
                this.print(byte.toString(16).toUpperCase().padStart(2, '0'))
                return
            case 'WORD':
                //the high byte of the 16 bit value rides on the high byte of the address bus, which
                //`out (c),r` fills from B — the only console port that looks at more than the port
                //number
                this.print(String((parameterOf(busAddress) << 8) | byte))
                return
            case 'SCREEN_PEN_COLOR':
                screen.setPenColor(expandColor(byte))
                return
            case 'SCREEN_FILL_COLOR':
                screen.setFillColor(expandColor(byte))
                return
            case 'SCREEN_PEN_WIDTH':
                screen.setPenWidth(Math.max(1, byte))
                return
            case 'SCREEN_X':
                this.x = byte
                return
            case 'SCREEN_Y':
                this.y = byte
                return
            case 'SCREEN_X2':
                this.x2 = byte
                return
            case 'SCREEN_Y2':
                this.y2 = byte
                return
            case 'SCREEN_COMMAND':
                this.runCommand(byte)
                return
            case 'SCREEN_CURSOR_COLUMN':
                screen.setCursor(byte, screen.cursorRow)
                return
            case 'SCREEN_CURSOR_ROW':
                screen.setCursor(screen.cursorColumn, byte)
                return
            default:
                //the read-only ports of the Screen, Keyboard, Mouse and time groups: a write is an
                //input the device has no room for, and dropping it keeps the bus's own convention
                return
        }
    }

    /** The prompt to show for the port an `in` is waiting on. */
    inputQuestion(busAddress: number): string {
        switch (Z80Device.portNameOf(busAddress)) {
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
        switch (Z80Device.portNameOf(busAddress)) {
            case 'CHAR':
                this.bufferLine(line)
                return
            case 'HEX':
                this.pendingNumber = parseHexByte(line)
                return
            default:
                //every other console port reads decimal; a port that never waits never gets here
                this.pendingNumber = parseDecimalByte(line)
                return
        }
    }

    /**
     * Hands the character port one keystroke, the Screen keyboard's answer to a character read
     * (ADR 0009). Unlike a line, it carries no trailing newline: the Enter key types one of its own.
     */
    provideCharacter(character: string): void {
        this.characterInput.push(byteOf(character))
    }

    /**
     * Lets the `in` that asked for a wait answer the next time it executes. The adapter calls it
     * when the clock has granted the wait, never before: the machine re-executes the instruction.
     */
    completeWait(busAddress: number): void {
        const name = Z80Device.portNameOf(busAddress)
        if (name === 'TIME_WAIT' || name === 'TIME_FRAME') this.servedWaits.add(name)
    }

    /**
     * Draws the echo of typed input at the Screen's text cursor, the single output window of
     * [ADR 0003](../../../../docs/adr/0003-preserve-simulator-graphics-conventions.md). The M68K
     * traps echo through the same helper, since EASy68K and the Z80 share the convention.
     */
    echo(text: string): void {
        echoToScreen(this.host.screen, text)
    }

    /** Drops everything buffered, for a machine that is being restarted. */
    reset(): void {
        this.characterInput.length = 0
        this.pendingNumber = undefined
        this.x = 0
        this.y = 0
        this.x2 = 0
        this.y2 = 0
        this.lastCommand = 0
        this.servedWaits.clear()
        this.graphical = false
    }

    /** Whether the program has used the Screen, the Keyboard or the Mouse in this run. */
    get isGraphical(): boolean {
        return this.graphical
    }

    /**
     * Console output goes to the Terminal transcript and to the Screen's text cursor at once: the
     * Z80, like EASy68K, has one output window, so text and graphics share the image while the
     * transcript keeps everything for testcases (ADR 0003, ADR 0011).
     */
    private print(text: string): void {
        this.host.write(text)
        this.host.screen.writeText(text)
    }

    private runCommand(command: number): void {
        const screen = this.host.screen
        this.lastCommand = command
        switch (command) {
            case Z80_SCREEN_COMMANDS.PIXEL:
                return screen.drawPixel(this.x, this.y)
            case Z80_SCREEN_COMMANDS.LINE:
                return screen.drawLine(this.x, this.y, this.x2, this.y2)
            case Z80_SCREEN_COMMANDS.LINE_TO:
                return screen.lineTo(this.x, this.y)
            case Z80_SCREEN_COMMANDS.MOVE_TO:
                return screen.moveTo(this.x, this.y)
            case Z80_SCREEN_COMMANDS.RECTANGLE:
                return screen.drawRectangle(this.x, this.y, this.x2, this.y2)
            case Z80_SCREEN_COMMANDS.RECTANGLE_OUTLINE:
                return screen.drawUnfilledRectangle(this.x, this.y, this.x2, this.y2)
            case Z80_SCREEN_COMMANDS.ELLIPSE:
                return screen.drawEllipse(this.x, this.y, this.x2, this.y2)
            case Z80_SCREEN_COMMANDS.ELLIPSE_OUTLINE:
                return screen.drawUnfilledEllipse(this.x, this.y, this.x2, this.y2)
            case Z80_SCREEN_COMMANDS.FLOOD_FILL:
                return screen.floodFill(this.x, this.y)
            case Z80_SCREEN_COMMANDS.CLEAR:
                //two Screen operations for one `out`, so they are journaled as one record: Undo
                //pops one per Core step and a second record would offset the whole journal
                //([ADR 0005](../../../../docs/adr/0005-restore-screen-state-on-undo.md))
                screen.beginCompoundOperation()
                try {
                    //the fill color becomes the background, so a scrolled text row and a later
                    //resize leave the same color behind as the clear did
                    screen.setBackgroundColor(screen.fillColor)
                    screen.clear()
                } finally {
                    screen.endCompoundOperation()
                }
                return
            case Z80_SCREEN_COMMANDS.RESIZE:
                return screen.resize(sizeOf(this.x), sizeOf(this.y))
            case Z80_SCREEN_COMMANDS.BUFFERING_ON:
                return screen.setDoubleBuffering(true)
            case Z80_SCREEN_COMMANDS.BUFFERING_OFF:
                return screen.setDoubleBuffering(false)
            case Z80_SCREEN_COMMANDS.PRESENT:
                return screen.present()
            default:
                //an undecoded command is dropped like a write to an undecoded port, rather than
                //stopping a program that a future command number would run on
                return
        }
    }

    private mouseView(parameter: number): MouseSnapshot {
        const mouse = this.host.mouse
        switch (parameter) {
            case Z80_MOUSE_VIEWS.LAST_UP:
                return mouse.lastUp()
            case Z80_MOUSE_VIEWS.LAST_DOWN:
                return mouse.lastDown()
            default:
                return mouse.state()
        }
    }

    /** The first Screen, Keyboard or Mouse access is what makes a run graphical (ADR 0009). */
    private noticeGraphicalUse(name: Z80PortName): void {
        if (this.graphical) return
        const group = z80PortGroupOf(name)
        if (group !== 'screen' && group !== 'keyboard' && group !== 'mouse') return
        this.graphical = true
        this.host.onGraphicalUse?.()
    }

    /**
     * The character port hands out one byte at a time and the line always ends with a newline, so a
     * program can read until it sees 0x0A instead of having to be told how long the line is.
     */
    private bufferLine(line: string): void {
        for (const character of line) this.characterInput.push(byteOf(character))
        this.characterInput.push(0x0a)
    }
}

/** The parameter register B, which `in r,(c)` and `out (c),r` drive onto the high address byte. */
function parameterOf(busAddress: number): number {
    return (busAddress >> 8) & 0xff
}

/** A size byte of 0 means 256: the only size of a byte-addressed Screen that a byte cannot hold. */
function sizeOf(size: number): number {
    return size === 0 ? Z80_SCREEN_MAX_SIZE : size
}

function byteOf(character: string): number {
    const code = character.codePointAt(0) ?? UNREPRESENTABLE_CHARACTER
    return code > 0xff ? UNREPRESENTABLE_CHARACTER : code
}

/**
 * A 3-3-2 color byte as the Screen's 24 bit color. Each field is stretched over eight bits by
 * repeating it, so the largest value of a field is 0xFF rather than 0xE0: 0xFF is white, 0xE0 is
 * pure red, and packing the result back gives the byte that produced it.
 */
export function expandColor(byte: number): ScreenColor {
    const red = (byte >> 5) & 0x07
    const green = (byte >> 2) & 0x07
    const blue = byte & 0x03
    return (
        ((((red << 5) | (red << 2) | (red >> 1)) & 0xff) << 16) |
        ((((green << 5) | (green << 2) | (green >> 1)) & 0xff) << 8) |
        (blue * 0x55)
    )
}

/** The Screen's 24 bit color as the nearest 3-3-2 byte: the top bits of each channel. */
export function packColor(color: ScreenColor): number {
    return ((color >> 16) & 0xe0) | (((color >> 8) & 0xe0) >> 3) | ((color & 0xc0) >> 6)
}

/** The mouse buttons byte: EASy68K's task 61 flags, Ctrl to Left from the high bit down. */
function mouseFlags(snapshot: MouseSnapshot): number {
    return (
        (snapshot.left ? Z80_MOUSE_FLAGS.LEFT : 0) |
        (snapshot.right ? Z80_MOUSE_FLAGS.RIGHT : 0) |
        (snapshot.middle ? Z80_MOUSE_FLAGS.MIDDLE : 0) |
        (snapshot.double ? Z80_MOUSE_FLAGS.DOUBLE : 0) |
        (snapshot.shift ? Z80_MOUSE_FLAGS.SHIFT : 0) |
        (snapshot.alt ? Z80_MOUSE_FLAGS.ALT : 0) |
        (snapshot.ctrl ? Z80_MOUSE_FLAGS.CTRL : 0)
    )
}

/** One byte of the elapsed hundredths, selected by B. Anything past the fourth byte reads as 0. */
function timeByte(hundredths: number, index: number): number {
    if (index > 3) return 0
    const clamped = Math.max(0, Math.floor(hundredths))
    return Math.floor(clamped / 2 ** (8 * index)) & 0xff
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
