import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Keyboard } from '$lib/languages/peripherals/Keyboard'
import { KEY_CODES } from '$lib/languages/peripherals/keyCodes'
import { Mouse } from '$lib/languages/peripherals/Mouse'
import { BLACK, WHITE } from '$lib/languages/peripherals/screen/color'
import { SCREEN_CELL_8X8 } from '$lib/languages/peripherals/screen/bitmapFont'
import { Screen } from '$lib/languages/peripherals/screen/Screen'
import {
    Z80_COLORS,
    Z80_MOUSE_FLAGS,
    Z80_MOUSE_VIEWS,
    Z80_PORT_DOCS,
    Z80_PORTS,
    Z80_SCREEN_COMMANDS,
    type Z80PortName
} from '$lib/languages/Z80/Z80-model'
import {
    expandColor,
    INVALID_HEX_NUMBER_ERROR,
    INVALID_NUMBER_ERROR,
    packColor,
    Z80_UNCONNECTED_PORT_VALUE,
    Z80Device
} from '$lib/languages/Z80/Z80Device'

/**
 * The whole port device against the real peripherals it drives: `Screen`, `Keyboard` and `Mouse` are
 * plain TypeScript, so a test can drive a program's `in`/`out` and then look at the pixels it drew
 * or the keys it polled ([ADR 0011](../../../../docs/adr/0011-z80-peripherals-through-the-port-map.md)).
 */
function makeDevice() {
    let output = ''
    let elapsedHundredths = 0
    let input = false
    let graphicalUses = 0
    const screen = new Screen({ width: 256, height: 192, cell: SCREEN_CELL_8X8 })
    const keyboard = new Keyboard({ holdIntervalMs: 0 })
    const mouse = new Mouse({ screen, keyboard })
    //a stand-in for the memory-mapped display: the port device only ever asks it whether it is on
    //and tells it to switch, so a test can drive both modes without a Core
    const cells = {
        isEnabled: false,
        enable() {
            cells.isEnabled = true
        },
        disable() {
            cells.isEnabled = false
        },
        resyncs: 0,
        resync() {
            cells.resyncs += 1
        }
    }
    const device = new Z80Device({
        write: (text) => {
            output += text
        },
        hasInput: () => input,
        timeHundredths: () => elapsedHundredths,
        screen,
        keyboard,
        mouse,
        cells,
        onGraphicalUse: () => {
            graphicalUses += 1
        }
    })
    return {
        device,
        screen,
        keyboard,
        mouse,
        cells,
        get output() {
            return output
        },
        get graphicalUses() {
            return graphicalUses
        },
        setInput(available: boolean) {
            input = available
        },
        setElapsed(hundredths: number) {
            elapsedHundredths = hundredths
        }
    }
}

/** The bus address an `out (c),r` or `in r,(c)` drives: B on the high byte, the port on the low one. */
function busAddress(port: number, parameter = 0): number {
    return (parameter << 8) | port
}

/** `out` the coordinates and then one command, the way every drawing program does it. */
function draw(
    device: Z80Device,
    command: number,
    coordinates: { x?: number; y?: number; x2?: number; y2?: number } = {}
) {
    const { x = 0, y = 0, x2 = 0, y2 = 0 } = coordinates
    device.writePort(Z80_PORTS.SCREEN_X, x)
    device.writePort(Z80_PORTS.SCREEN_Y, y)
    device.writePort(Z80_PORTS.SCREEN_X2, x2)
    device.writePort(Z80_PORTS.SCREEN_Y2, y2)
    device.writePort(Z80_PORTS.SCREEN_COMMAND, command)
}

describe('Z80Device port decoding', () => {
    it('names every port and only looks at the low byte of the bus address', () => {
        expect(Z80Device.portNameOf(Z80_PORTS.CHAR)).toBe('CHAR')
        expect(Z80Device.portNameOf(busAddress(Z80_PORTS.WORD, 0x12))).toBe('WORD')
        expect(Z80Device.portNameOf(busAddress(Z80_PORTS.MOUSE_X, 2))).toBe('MOUSE_X')
        expect(Z80Device.portNameOf(0x00)).toBeUndefined()
    })

    it('groups the ports the way the documentation does', () => {
        expect(Z80Device.groupOf(Z80_PORTS.CHAR)).toBe('console')
        expect(Z80Device.groupOf(Z80_PORTS.SCREEN_COMMAND)).toBe('screen')
        expect(Z80Device.groupOf(Z80_PORTS.KEY_STATE)).toBe('keyboard')
        expect(Z80Device.groupOf(Z80_PORTS.MOUSE_BUTTONS)).toBe('mouse')
        expect(Z80Device.groupOf(Z80_PORTS.TIME_NOW)).toBe('time')
        expect(Z80Device.groupOf(0xf0)).toBeUndefined()
    })

    it('documents every port exactly once', () => {
        const documented = Z80_PORT_DOCS.map((doc) => doc.name).sort()
        const mapped = (Object.keys(Z80_PORTS) as Z80PortName[]).sort()
        expect(documented).toEqual(mapped)
        //a port number used twice would silently shadow one of the two devices
        expect(new Set(Object.values(Z80_PORTS)).size).toBe(mapped.length)
    })

    it('reads an empty bus and drops writes on ports with nothing attached', () => {
        const { device, output } = makeDevice()
        expect(device.readPort(0x60)).toBe(Z80_UNCONNECTED_PORT_VALUE)
        device.writePort(0x60, 0x41)
        expect(output).toBe('')
        //port 0 is deliberately one of them: it is the TRS-80's joystick, and a program polling it
        //expects exactly this floating-high answer (ADR 0011, ADR 0020)
        expect(device.readPort(0x00)).toBe(Z80_UNCONNECTED_PORT_VALUE)
    })
})

describe('Z80Device console output', () => {
    it('prints one Latin-1 character per byte', () => {
        const device = makeDevice()
        for (const byte of [0x48, 0x69, 0x0a]) device.device.writePort(Z80_PORTS.CHAR, byte)
        expect(device.output).toBe('Hi\n')
    })

    it('prints the same byte as unsigned, signed and hexadecimal', () => {
        const device = makeDevice()
        device.device.writePort(Z80_PORTS.NUMBER, 200)
        device.device.writePort(Z80_PORTS.SIGNED, 200)
        device.device.writePort(Z80_PORTS.HEX, 200)
        expect(device.output).toBe('200-56C8')
    })

    it('pads a hexadecimal byte to two digits', () => {
        const device = makeDevice()
        device.device.writePort(Z80_PORTS.HEX, 0x0a)
        expect(device.output).toBe('0A')
    })

    it('takes the high byte of a 16 bit number off the address bus', () => {
        const device = makeDevice()
        device.device.writePort(busAddress(Z80_PORTS.WORD, 1000 >> 8), 1000 & 0xff)
        expect(device.output).toBe('1000')
    })

    it('prints only the low byte of a value wider than the bus', () => {
        const device = makeDevice()
        device.device.writePort(Z80_PORTS.NUMBER, 0x1ff)
        expect(device.output).toBe('255')
    })

    it('draws what it prints at the Screen text cursor, in 8 by 8 cells', () => {
        const device = makeDevice()
        //the Z80 has one output window, like EASy68K: the transcript and the Screen both get it
        for (const byte of [0x41, 0x0a, 0x42]) device.device.writePort(Z80_PORTS.CHAR, byte)
        expect(device.output).toBe('A\nB')
        expect(device.screen.cursorColumn).toBe(1)
        expect(device.screen.cursorRow).toBe(1)
        //the glyph of "A" has its top left cell corner at (0, 0) and is painted in the pen color
        expect(device.screen.getPixel(3, 1)).toBe(WHITE)
    })

    it('echoes typed input at the cursor and erases what a backspace took back', () => {
        const device = makeDevice()
        device.device.echo('ab')
        expect(device.screen.cursorColumn).toBe(2)
        device.device.echo('\b')
        expect(device.screen.cursorColumn).toBe(1)
        //the erased cell is blank again, and the echo is not in the transcript: the Terminal owns it
        for (let x = 8; x < 16; x++) {
            for (let y = 0; y < 8; y++) expect(device.screen.getPixel(x, y)).toBe(BLACK)
        }
        expect(device.output).toBe('')
    })
})

describe('Z80Device console input', () => {
    it('hands out one character of the line at a time, ending with a newline', () => {
        const { device } = makeDevice()
        expect(device.readPort(Z80_PORTS.CHAR)).toBeUndefined()
        device.provideInput(Z80_PORTS.CHAR, 'ab')
        expect(device.readPort(Z80_PORTS.CHAR)).toBe(0x61)
        expect(device.readPort(Z80_PORTS.CHAR)).toBe(0x62)
        expect(device.readPort(Z80_PORTS.CHAR)).toBe(0x0a)
        expect(device.readPort(Z80_PORTS.CHAR)).toBeUndefined()
    })

    it('hands out a single keystroke without a newline of its own', () => {
        const { device } = makeDevice()
        //the Screen keyboard answers a character read as soon as one is typed (ADR 0009); the Enter
        //key types its own newline, so a program reading until 0x0A still works
        device.provideCharacter('x')
        expect(device.readPort(Z80_PORTS.CHAR)).toBe(0x78)
        expect(device.readPort(Z80_PORTS.CHAR)).toBeUndefined()
    })

    it('substitutes a question mark for a character that does not fit a byte', () => {
        const { device } = makeDevice()
        device.provideInput(Z80_PORTS.CHAR, 'é☃')
        expect(device.readPort(Z80_PORTS.CHAR)).toBe(0xe9)
        expect(device.readPort(Z80_PORTS.CHAR)).toBe(0x3f)
    })

    it('parses a line per numeric read', () => {
        const { device } = makeDevice()
        expect(device.readPort(Z80_PORTS.NUMBER)).toBeUndefined()
        device.provideInput(Z80_PORTS.NUMBER, ' 21 ')
        expect(device.readPort(Z80_PORTS.NUMBER)).toBe(21)
        expect(device.readPort(Z80_PORTS.NUMBER)).toBeUndefined()
    })

    it('returns a negative number as its two complement byte', () => {
        const { device } = makeDevice()
        device.provideInput(Z80_PORTS.SIGNED, '-5')
        expect(device.readPort(Z80_PORTS.SIGNED)).toBe(0xfb)
    })

    it('accepts every hexadecimal spelling the assembler does', () => {
        const { device } = makeDevice()
        for (const line of ['ff', '0xFF', '$ff', 'FFh']) {
            device.provideInput(Z80_PORTS.HEX, line)
            expect(device.readPort(Z80_PORTS.HEX)).toBe(0xff)
        }
    })

    it('refuses a line that is not the number the port asked for', () => {
        const { device } = makeDevice()
        expect(() => device.provideInput(Z80_PORTS.NUMBER, 'twelve')).toThrow(INVALID_NUMBER_ERROR)
        expect(() => device.provideInput(Z80_PORTS.HEX, 'zz')).toThrow(INVALID_HEX_NUMBER_ERROR)
    })

    it('names the input a port is waiting for', () => {
        const { device } = makeDevice()
        expect(device.inputQuestion(Z80_PORTS.CHAR)).toMatch(/line of text/i)
        expect(device.inputQuestion(Z80_PORTS.HEX)).toMatch(/hexadecimal/i)
        expect(device.inputQuestion(Z80_PORTS.NUMBER)).toMatch(/number/i)
    })

    it('drops buffered input on a reset', () => {
        const { device } = makeDevice()
        device.provideInput(Z80_PORTS.CHAR, 'ab')
        device.provideInput(Z80_PORTS.NUMBER, '7')
        device.reset()
        expect(device.readPort(Z80_PORTS.CHAR)).toBeUndefined()
        expect(device.readPort(Z80_PORTS.NUMBER)).toBeUndefined()
    })
})

describe('Z80Device colors', () => {
    it('expands a 3-3-2 byte by repeating each field', () => {
        expect(expandColor(Z80_COLORS.WHITE)).toBe(0xffffff)
        expect(expandColor(Z80_COLORS.BLACK)).toBe(0x000000)
        expect(expandColor(Z80_COLORS.RED)).toBe(0xff0000)
        expect(expandColor(Z80_COLORS.GREEN)).toBe(0x00ff00)
        expect(expandColor(Z80_COLORS.BLUE)).toBe(0x0000ff)
        expect(expandColor(Z80_COLORS.YELLOW)).toBe(0xffff00)
    })

    it('packs every named color back to the byte it came from', () => {
        for (const color of Object.values(Z80_COLORS)) {
            expect(packColor(expandColor(color))).toBe(color)
        }
    })
})

describe('Z80Device screen', () => {
    it('draws a pixel in the pen color and reads it back in 3-3-2', () => {
        const { device, screen } = makeDevice()
        device.writePort(Z80_PORTS.SCREEN_PEN_COLOR, Z80_COLORS.RED)
        draw(device, Z80_SCREEN_COMMANDS.PIXEL, { x: 10, y: 20 })
        expect(screen.getPixel(10, 20)).toBe(0xff0000)
        expect(device.readPort(Z80_PORTS.SCREEN_PIXEL)).toBe(Z80_COLORS.RED)
        expect(device.readPort(Z80_PORTS.SCREEN_PEN_COLOR)).toBe(Z80_COLORS.RED)
    })

    it('answers a coordinate read with the byte last written', () => {
        const { device } = makeDevice()
        draw(device, Z80_SCREEN_COMMANDS.MOVE_TO, { x: 3, y: 4, x2: 5, y2: 6 })
        expect(device.readPort(Z80_PORTS.SCREEN_X)).toBe(3)
        expect(device.readPort(Z80_PORTS.SCREEN_Y)).toBe(4)
        expect(device.readPort(Z80_PORTS.SCREEN_X2)).toBe(5)
        expect(device.readPort(Z80_PORTS.SCREEN_Y2)).toBe(6)
        expect(device.readPort(Z80_PORTS.SCREEN_COMMAND)).toBe(Z80_SCREEN_COMMANDS.MOVE_TO)
    })

    it('fills a shape with the fill color and outlines it with the pen', () => {
        const { device, screen } = makeDevice()
        device.writePort(Z80_PORTS.SCREEN_FILL_COLOR, Z80_COLORS.GREEN)
        device.writePort(Z80_PORTS.SCREEN_PEN_COLOR, Z80_COLORS.RED)
        draw(device, Z80_SCREEN_COMMANDS.RECTANGLE, { x: 4, y: 4, x2: 10, y2: 10 })
        expect(screen.getPixel(4, 4)).toBe(0xff0000)
        expect(screen.getPixel(6, 6)).toBe(0x00ff00)
        //the right and bottom edges are excluded, as EASy68K's are
        expect(screen.getPixel(10, 10)).toBe(0x000000)
    })

    it('draws a line from the drawing position with line-to', () => {
        const { device, screen } = makeDevice()
        draw(device, Z80_SCREEN_COMMANDS.MOVE_TO, { x: 0, y: 0 })
        draw(device, Z80_SCREEN_COMMANDS.LINE_TO, { x: 5, y: 0 })
        for (let x = 0; x <= 5; x++) expect(screen.getPixel(x, 0)).toBe(WHITE)
        expect(screen.getPixel(6, 0)).toBe(BLACK)
    })

    it('clears to the fill color and adopts it as the background', () => {
        const { device, screen } = makeDevice()
        device.writePort(Z80_PORTS.SCREEN_FILL_COLOR, Z80_COLORS.BLUE)
        draw(device, Z80_SCREEN_COMMANDS.CLEAR)
        expect(screen.getPixel(100, 100)).toBe(0x0000ff)
        //the background is what a scrolled text row and a later resize leave behind
        expect(screen.backgroundColor).toBe(0x0000ff)
        expect(screen.cursorColumn).toBe(0)
        expect(screen.cursorRow).toBe(0)
    })

    it('journals the clear as the one record its `out` is worth', () => {
        const { device, screen } = makeDevice()
        device.writePort(Z80_PORTS.SCREEN_PEN_COLOR, Z80_COLORS.RED)
        draw(device, Z80_SCREEN_COMMANDS.PIXEL, { x: 10, y: 10 })
        const beforeClear = screen.history.sequence
        device.writePort(Z80_PORTS.SCREEN_FILL_COLOR, Z80_COLORS.BLUE)
        //Undo pops one Screen record per rolled back Core step, so the two operations behind this
        //one `out` have to be one record or the journal drifts ahead of the code (ADR 0005)
        draw(device, Z80_SCREEN_COMMANDS.CLEAR)
        expect(screen.history.sequence).toBe(beforeClear + 2)

        screen.undo()
        expect(screen.getPixel(10, 10)).toBe(0xff0000)
        expect(screen.backgroundColor).toBe(BLACK)
    })

    it('resizes with a byte per side, where 0 means 256', () => {
        const { device, screen } = makeDevice()
        draw(device, Z80_SCREEN_COMMANDS.RESIZE, { x: 0, y: 128 })
        expect(screen.getSize()).toEqual({ width: 256, height: 128 })
        expect(screen.columns).toBe(32)
        expect(screen.rows).toBe(16)
    })

    it('hides drawing until it is presented while double buffering', () => {
        const { device, screen } = makeDevice()
        device.writePort(Z80_PORTS.SCREEN_COMMAND, Z80_SCREEN_COMMANDS.BUFFERING_ON)
        draw(device, Z80_SCREEN_COMMANDS.PIXEL, { x: 1, y: 1 })
        const before = screen.version
        //the pixel is on the off-screen image, which is the one a pixel read sees
        expect(device.readPort(Z80_PORTS.SCREEN_PIXEL)).toBe(Z80_COLORS.WHITE)
        expect(screen.visiblePixels[(1 * 256 + 1) * 4]).toBe(0)
        device.writePort(Z80_PORTS.SCREEN_COMMAND, Z80_SCREEN_COMMANDS.PRESENT)
        expect(screen.visiblePixels[(1 * 256 + 1) * 4]).toBe(255)
        expect(screen.version).toBeGreaterThan(before)
    })

    it('moves the text cursor in character cells', () => {
        const { device, screen } = makeDevice()
        device.writePort(Z80_PORTS.SCREEN_CURSOR_COLUMN, 12)
        device.writePort(Z80_PORTS.SCREEN_CURSOR_ROW, 8)
        expect(device.readPort(Z80_PORTS.SCREEN_CURSOR_COLUMN)).toBe(12)
        expect(device.readPort(Z80_PORTS.SCREEN_CURSOR_ROW)).toBe(8)
        device.writePort(Z80_PORTS.CHAR, 0x41)
        expect(screen.getPixel(12 * 8 + 3, 8 * 8 + 1)).toBe(WHITE)
        //out of range values are clamped instead of failing, like every Screen operation
        device.writePort(Z80_PORTS.SCREEN_CURSOR_COLUMN, 200)
        expect(device.readPort(Z80_PORTS.SCREEN_CURSOR_COLUMN)).toBe(31)
    })

    it('drops an undecoded command instead of stopping the program', () => {
        const { device, screen } = makeDevice()
        const version = screen.version
        device.writePort(Z80_PORTS.SCREEN_COMMAND, 0xfe)
        expect(screen.version).toBe(version)
    })
})

describe('Z80Device keyboard', () => {
    it('answers the availability port from the Terminal, scripted input included', () => {
        const device = makeDevice()
        expect(device.device.readPort(Z80_PORTS.KEY_AVAILABLE)).toBe(0)
        device.setInput(true)
        expect(device.device.readPort(Z80_PORTS.KEY_AVAILABLE)).toBe(1)
    })

    it('reads the state of the key whose code is in B', () => {
        const { device, keyboard } = makeDevice()
        keyboard.pressKey(KEY_CODES.RIGHT_ARROW)
        expect(device.readPort(busAddress(Z80_PORTS.KEY_STATE, KEY_CODES.RIGHT_ARROW))).toBe(1)
        expect(device.readPort(busAddress(Z80_PORTS.KEY_STATE, KEY_CODES.LEFT_ARROW))).toBe(0)
        keyboard.releaseKey(KEY_CODES.RIGHT_ARROW)
        expect(device.readPort(busAddress(Z80_PORTS.KEY_STATE, KEY_CODES.RIGHT_ARROW))).toBe(0)
    })

    it('remembers the last key pressed and released', () => {
        const { device, keyboard } = makeDevice()
        expect(device.readPort(Z80_PORTS.KEY_LAST_DOWN)).toBe(0)
        keyboard.pressKey(KEY_CODES.SPACE)
        keyboard.releaseKey(KEY_CODES.SPACE)
        expect(device.readPort(Z80_PORTS.KEY_LAST_DOWN)).toBe(KEY_CODES.SPACE)
        expect(device.readPort(Z80_PORTS.KEY_LAST_UP)).toBe(KEY_CODES.SPACE)
    })
})

describe('Z80Device mouse', () => {
    it('answers with the view B selects', () => {
        const { device, mouse } = makeDevice()
        mouse.buttonDown('left', 10, 20)
        mouse.buttonUp('left', 30, 40)
        mouse.moveTo(50, 60)
        expect(device.readPort(busAddress(Z80_PORTS.MOUSE_X, Z80_MOUSE_VIEWS.CURRENT))).toBe(50)
        expect(device.readPort(busAddress(Z80_PORTS.MOUSE_Y, Z80_MOUSE_VIEWS.CURRENT))).toBe(60)
        expect(device.readPort(busAddress(Z80_PORTS.MOUSE_X, Z80_MOUSE_VIEWS.LAST_DOWN))).toBe(10)
        expect(device.readPort(busAddress(Z80_PORTS.MOUSE_Y, Z80_MOUSE_VIEWS.LAST_DOWN))).toBe(20)
        expect(device.readPort(busAddress(Z80_PORTS.MOUSE_X, Z80_MOUSE_VIEWS.LAST_UP))).toBe(30)
        expect(device.readPort(busAddress(Z80_PORTS.MOUSE_Y, Z80_MOUSE_VIEWS.LAST_UP))).toBe(40)
    })

    it('packs the buttons and modifiers the way EASy68K does', () => {
        const { device, mouse, keyboard } = makeDevice()
        keyboard.pressKey(KEY_CODES.SHIFT)
        mouse.buttonDown('right', 1, 1)
        const flags = device.readPort(busAddress(Z80_PORTS.MOUSE_BUTTONS, Z80_MOUSE_VIEWS.CURRENT))
        expect(flags).toBe(Z80_MOUSE_FLAGS.RIGHT | Z80_MOUSE_FLAGS.SHIFT)
    })

    it('counts events so a program can tell a new click from an old one', () => {
        const { device, mouse } = makeDevice()
        const current = busAddress(Z80_PORTS.MOUSE_EVENTS, Z80_MOUSE_VIEWS.CURRENT)
        const lastDown = busAddress(Z80_PORTS.MOUSE_EVENTS, Z80_MOUSE_VIEWS.LAST_DOWN)
        //a snapshot that never happened reads as 0, which is how a program tells it from a click
        expect(device.readPort(lastDown)).toBe(0)
        mouse.moveTo(5, 5)
        const moved = device.readPort(current) as number
        mouse.buttonDown('left')
        expect(device.readPort(current)).toBe(moved + 1)
        expect(device.readPort(lastDown)).toBe(moved + 1)
    })
})

describe('Z80Device program time', () => {
    it('suspends a wait read until the adapter has granted it', () => {
        const { device } = makeDevice()
        const port = busAddress(Z80_PORTS.TIME_WAIT, 25)
        expect(Z80Device.isWaitPort(port)).toBe(true)
        expect(Z80Device.waitHundredthsOf(port)).toBe(25)
        expect(device.readPort(port)).toBeUndefined()
        device.completeWait(port)
        expect(device.readPort(port)).toBe(0)
        //one grant serves one `in`: the next wait suspends the program again
        expect(device.readPort(port)).toBeUndefined()
    })

    it('suspends a frame sync the same way, with no duration', () => {
        const { device } = makeDevice()
        expect(Z80Device.isWaitPort(Z80_PORTS.TIME_FRAME)).toBe(true)
        expect(device.readPort(Z80_PORTS.TIME_FRAME)).toBeUndefined()
        device.completeWait(Z80_PORTS.TIME_FRAME)
        expect(device.readPort(Z80_PORTS.TIME_FRAME)).toBe(0)
    })

    it('reads the elapsed hundredths one byte at a time', () => {
        const device = makeDevice()
        device.setElapsed(0x01020304)
        for (const [index, byte] of [0x04, 0x03, 0x02, 0x01].entries()) {
            expect(device.device.readPort(busAddress(Z80_PORTS.TIME_NOW, index))).toBe(byte)
        }
        //past the fourth byte there is nothing left of a 32 bit count
        expect(device.device.readPort(busAddress(Z80_PORTS.TIME_NOW, 4))).toBe(0)
    })

    it('forgets a granted wait on a reset', () => {
        const { device } = makeDevice()
        device.completeWait(Z80_PORTS.TIME_FRAME)
        device.reset()
        expect(device.readPort(Z80_PORTS.TIME_FRAME)).toBeUndefined()
    })
})

describe('Z80Device graphical use', () => {
    let device: ReturnType<typeof makeDevice>

    beforeEach(() => {
        device = makeDevice()
    })

    it('is not graphical while the program only prints', () => {
        device.device.writePort(Z80_PORTS.CHAR, 0x41)
        device.device.readPort(Z80_PORTS.CHAR)
        expect(device.graphicalUses).toBe(0)
        expect(device.device.isGraphical).toBe(false)
    })

    it('turns graphical once, on the first Screen, Keyboard or Mouse port', () => {
        device.device.writePort(Z80_PORTS.SCREEN_PEN_COLOR, Z80_COLORS.RED)
        device.device.readPort(Z80_PORTS.KEY_LAST_DOWN)
        device.device.readPort(busAddress(Z80_PORTS.MOUSE_X))
        expect(device.graphicalUses).toBe(1)
        expect(device.device.isGraphical).toBe(true)
    })

    it('starts over after a reset, because a run starts over', () => {
        device.device.readPort(Z80_PORTS.KEY_AVAILABLE)
        device.device.reset()
        expect(device.device.isGraphical).toBe(false)
        device.device.readPort(Z80_PORTS.KEY_AVAILABLE)
        expect(device.graphicalUses).toBe(2)
    })

    it('does not turn graphical on the time ports, which a compute program may use', () => {
        device.device.readPort(Z80_PORTS.TIME_NOW)
        expect(device.device.isGraphical).toBe(false)
    })
})

describe('Z80Device write-only and read-only ports', () => {
    it('drops a write to a port the program can only read', () => {
        const { device, screen } = makeDevice()
        const version = screen.version
        for (const port of [
            Z80_PORTS.SCREEN_PIXEL,
            Z80_PORTS.KEY_AVAILABLE,
            Z80_PORTS.KEY_STATE,
            Z80_PORTS.MOUSE_X,
            Z80_PORTS.TIME_WAIT,
            Z80_PORTS.TIME_NOW
        ]) {
            device.writePort(port, 0xff)
        }
        expect(screen.version).toBe(version)
    })

    it('never lets a read throw, whatever the peripherals answer', () => {
        const { device } = makeDevice()
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        for (let port = 0; port < 256; port++) expect(() => device.readPort(port)).not.toThrow()
        spy.mockRestore()
    })
})

/**
 * The two Screen modes through the port map
 * ([ADR 0020](../../../../docs/adr/0020-mirror-the-trs80-display-in-guest-memory.md)). What the
 * memory-mapped display does with the memory it mirrors is `Trs80Devices`' half; this is what the
 * ports do once it is on.
 */
describe('Z80 screen modes', () => {
    it('switches with the two mode commands and starts on the drawing one', () => {
        const { device, cells } = makeDevice()
        expect(cells.isEnabled).toBe(false)
        device.writePort(Z80_PORTS.SCREEN_COMMAND, Z80_SCREEN_COMMANDS.MODE_CELLS)
        expect(cells.isEnabled).toBe(true)
        device.writePort(Z80_PORTS.SCREEN_COMMAND, Z80_SCREEN_COMMANDS.MODE_DRAWING)
        expect(cells.isEnabled).toBe(false)
    })

    it('names the drawing command that the memory-mapped display has no room for', () => {
        const { device } = makeDevice()
        device.writePort(Z80_PORTS.SCREEN_COMMAND, Z80_SCREEN_COMMANDS.MODE_CELLS)
        expect(() => draw(device, Z80_SCREEN_COMMANDS.PIXEL)).toThrow(/PIXEL/)
        expect(() => draw(device, Z80_SCREEN_COMMANDS.CLEAR)).toThrow(/0x3C00/)
        expect(() => device.readPort(Z80_PORTS.SCREEN_PIXEL)).toThrow(/pixel-color/)
        expect(() => device.writePort(Z80_PORTS.SCREEN_CURSOR_ROW, 0)).toThrow(/text cursor/)
        //a command number nothing decodes is dropped in either mode, as an unconnected port is
        expect(() => device.writePort(Z80_PORTS.SCREEN_COMMAND, 99)).not.toThrow()
    })

    it('repaints the cells when the ink or the paper changes', () => {
        const { device, cells, screen } = makeDevice()
        device.writePort(Z80_PORTS.SCREEN_COMMAND, Z80_SCREEN_COMMANDS.MODE_CELLS)
        const before = cells.resyncs
        device.writePort(Z80_PORTS.SCREEN_PEN_COLOR, 0xe0)
        expect(cells.resyncs).toBe(before + 1)
        //the fill port is the paper of a cell display, so it adopts the background with it
        device.writePort(Z80_PORTS.SCREEN_FILL_COLOR, 0x03)
        expect(cells.resyncs).toBe(before + 2)
        expect(screen.backgroundColor).toBe(expandColor(0x03))
    })

    it('keeps console output in the transcript, off a display that has no text cursor', () => {
        const view = makeDevice()
        view.device.writePort(Z80_PORTS.SCREEN_COMMAND, Z80_SCREEN_COMMANDS.MODE_CELLS)
        view.device.writePort(Z80_PORTS.CHAR, 0x41)
        view.device.echo('A')
        expect(view.output).toBe('A')
        //nothing was drawn: on this machine printing is storing a byte, which is the program's job
        expect(view.screen.history.sequence).toBe(0)
    })

    it('leaves console reads on the prompt, the only view of typing a cell display has', () => {
        const view = makeDevice()
        view.device.writePort(Z80_PORTS.SCREEN_COMMAND, Z80_SCREEN_COMMANDS.MODE_CELLS)
        //a screen port, which is what makes a run graphical for every other Z80 program (ADR 0009)
        view.device.writePort(Z80_PORTS.SCREEN_PEN_COLOR, 0xff)
        expect(view.graphicalUses).toBe(0)
        expect(view.device.isGraphical).toBe(false)
    })
})
