/**
 * The parts of the Z80 programming model that more than one module has to agree on: the register
 * list the emulator shows, the flag bits, and the console device that programs talk to through
 * `in`/`out`. The emulator adapter, the editor tooling and the documentation pages all read from
 * here so that a port number or a register name is defined exactly once.
 *
 * This module is plain data: no Svelte runes, no imports from the rest of the app, so it can be
 * imported from a `+page.server.ts` during prerendering and probed from node.
 */

/**
 * Registers shown in the register panel and accepted by testcases, in display order. `a` is an
 * 8 bit register, everything else is a 16 bit pair. The other 8 bit halves (b, c, d, e, h, l, f)
 * are visible as the byte groups of their pair, the flags register is rendered as the status
 * flags section (see `Z80_FLAGS`). The alternate set (`af'`, `bc'`, `de'`, `hl'`) is only reachable
 * through `ex af,af'` and `exx`; `i`, `r` and the undocumented `ixh`/`ixl`/`iyh`/`iyl` halves are
 * not shown.
 */
export const Z80_REGISTER_NAMES = [
    'a',
    'bc',
    'de',
    'hl',
    'ix',
    'iy',
    'sp',
    'pc',
    "af'",
    "bc'",
    "de'",
    "hl'"
] as const

export type Z80RegisterName = (typeof Z80_REGISTER_NAMES)[number]

/**
 * The registers a testcase may preset. `pc` is excluded: loading the assembled program decides
 * where execution starts (the `end` directive's address, else the first address with code).
 */
export const Z80_STARTING_REGISTER_NAMES: Z80RegisterName[] = Z80_REGISTER_NAMES.filter(
    (name) => name !== 'pc'
)

/**
 * The documented bits of the F register, in the order the status flags section shows them
 * (most significant first). Bits 3 and 5 are undocumented copies of the result and are not shown.
 */
export const Z80_FLAGS = [
    {
        name: 'S',
        bit: 7,
        description: 'Sign: set when the result is negative (bit 7 of the result).'
    },
    { name: 'Z', bit: 6, description: 'Zero: set when the result is zero.' },
    {
        name: 'H',
        bit: 4,
        description: 'Half carry: carry from bit 3 to bit 4, used by `daa` for BCD arithmetic.'
    },
    {
        name: 'P/V',
        bit: 2,
        description:
            'Parity/overflow: parity of the result for logical and rotate instructions (set when even), signed overflow for arithmetic instructions.'
    },
    {
        name: 'N',
        bit: 1,
        description: 'Add/subtract: set when the last operation was a subtraction, used by `daa`.'
    },
    {
        name: 'C',
        bit: 0,
        description:
            'Carry: carry out of bit 7 (or 15), borrow for subtractions, and the bit shifted out by rotates and shifts.'
    }
] as const

/**
 * The 6 character flag strings in the instruction table (`ClrInstruction.flags` from `@specy/z80`)
 * list the flags in this order: `add a,b` is `+0V+++` (C affected, N reset, P/V holds overflow, H,
 * Z and S affected), `cpl` is `-1-1--` (N and H set, the others untouched).
 */
export const Z80_FLAG_STRING_ORDER = ['C', 'N', 'P/V', 'H', 'Z', 'S'] as const

/**
 * Meaning of one character of a flag string.
 */
export const Z80_FLAG_STRING_LEGEND: Record<string, string> = {
    '-': 'not affected',
    '+': 'affected by the result',
    '0': 'reset',
    '1': 'set',
    '*': 'undefined',
    V: 'holds the signed overflow',
    P: 'holds the parity of the result',
    ' ': 'undefined'
}

/**
 * Where the default program is assembled (`.org 0x8000`) and where the global memory tab opens.
 * The low 64 bytes of a real Z80 hold the reset and `rst` vectors, so programs traditionally live
 * higher up.
 */
export const Z80_DEFAULT_ORG = 0x8000

/**
 * Initial stack pointer. The Z80 decrements SP before writing, so the first push lands at
 * 0xFFFD-0xFFFE and the top of memory is never written by the stack itself.
 */
export const Z80_STACK_TOP = 0xffff

export const Z80_MEMORY_SIZE = 0x10000

/**
 * The largest Screen a Z80 program can ask for. Coordinates and sizes are single bytes, so the
 * Screen is at most 256 by 256 logical pixels; a size byte of 0 means 256, the only size that does
 * not fit in a byte ([ADR 0011](../../../../docs/adr/0011-z80-peripherals-through-the-port-map.md)).
 */
export const Z80_SCREEN_MAX_SIZE = 256

/**
 * The port map: how a Z80 program reaches every peripheral. A Z80 has no system calls, so programs
 * talk to the outside world with `in` and `out`, which address one of 256 ports with the low byte
 * of the address bus. The emulator decodes four groups — the console ports of
 * [ADR 0002](../../../../docs/adr/0002-z80-console-ports.md) for the Terminal, and the Screen,
 * Keyboard, Mouse and program-time ports of
 * [ADR 0011](../../../../docs/adr/0011-z80-peripherals-through-the-port-map.md) — and every other
 * port behaves like an empty bus: writes are dropped and reads answer 0xFF.
 *
 * `out (n),a` and `in a,(n)` put A on the high byte of the address bus; the `(c)` forms
 * (`out (c),r`, `in r,(c)`) put B there. B is how a read carries its parameter: the key code for
 * the key-state port, the view for the mouse ports, the byte index for the time port and the
 * duration for the wait port. Of the writes, only the WORD console port reads the high byte.
 */
export const Z80_PORTS = {
    /**
     * Character port. Writing sends the byte to the terminal as a character (Latin-1: 0x41 prints
     * "A", 0x0A is a newline) and draws it at the Screen's text cursor. Reading returns the next
     * character of the current input line; when no input is buffered the program pauses until a
     * line has been typed (or, during testcases, taken from the testcase input). The line is
     * delivered with a trailing newline (0x0A) so a program can read until it sees one. Once the
     * program has used a Screen, Keyboard or Mouse port the characters come from the Screen's
     * Keyboard instead, one keystroke at a time. Reads never fail: end of input only pauses the
     * program.
     */
    CHAR: 0x10,
    /**
     * Number port. Writing prints the byte as an unsigned decimal number (0 to 255). Reading asks
     * for a whole line, parses it as a decimal number (a leading minus sign is accepted) and
     * returns its low byte; a line that is not a number stops the program with an error.
     */
    NUMBER: 0x11,
    /**
     * Signed number port. Writing prints the byte as a signed decimal number (-128 to 127).
     * Reading behaves like the `NUMBER` port.
     */
    SIGNED: 0x12,
    /**
     * Hexadecimal port. Writing prints the byte as two upper case hexadecimal digits (no prefix).
     * Reading asks for a line, parses it as hexadecimal (an optional `0x`, `$` prefix or `h`
     * suffix is accepted) and returns its low byte; an invalid line stops the program with an error.
     */
    HEX: 0x13,
    /**
     * 16 bit number port. Writing prints the unsigned decimal value of the 16 bit number whose
     * high byte is the high byte of the port address and whose low byte is the byte written. With
     * `ld b,h` / `ld c,0x14` / `out (c),l` that prints HL. Reading behaves like the `NUMBER` port
     * (only the low byte can be returned).
     */
    WORD: 0x14,

    /** Pen color, one 3-3-2 byte: the color of lines, outlines, pixels and text. */
    SCREEN_PEN_COLOR: 0x20,
    /** Fill color, one 3-3-2 byte: the inside of filled shapes, the flood fill and the clear. */
    SCREEN_FILL_COLOR: 0x21,
    /** Pen width in pixels, 1 or more, for lines and outlines. */
    SCREEN_PEN_WIDTH: 0x22,
    /** First X coordinate: the point of a pixel, the start of a line, a corner of a shape. */
    SCREEN_X: 0x23,
    /** First Y coordinate. */
    SCREEN_Y: 0x24,
    /** Second X coordinate: the end of a line or the opposite corner of a shape. */
    SCREEN_X2: 0x25,
    /** Second Y coordinate. */
    SCREEN_Y2: 0x26,
    /** Runs one drawing operation on the coordinates and colors already set; see `Z80_SCREEN_COMMANDS`. */
    SCREEN_COMMAND: 0x27,
    /** Reads the color of the pixel at (X, Y) as a 3-3-2 byte. */
    SCREEN_PIXEL: 0x28,
    /** Text cursor column, in 8 by 8 character cells: 0 to 31 on the default Screen. */
    SCREEN_CURSOR_COLUMN: 0x29,
    /** Text cursor row, in 8 by 8 character cells: 0 to 23 on the default Screen. */
    SCREEN_CURSOR_ROW: 0x2a,

    /** 1 when a character typed on the Screen (or a testcase input line) is waiting, else 0. */
    KEY_AVAILABLE: 0x30,
    /** 1 while the key whose code is in B is held down, else 0. */
    KEY_STATE: 0x31,
    /** The code of the last key pressed, 0 before the first press. */
    KEY_LAST_DOWN: 0x32,
    /** The code of the last key released, 0 before the first release. */
    KEY_LAST_UP: 0x33,

    /** Mouse X in logical Screen pixels; B selects the view, see `Z80_MOUSE_VIEWS`. */
    MOUSE_X: 0x40,
    /** Mouse Y in logical Screen pixels; B selects the view. */
    MOUSE_Y: 0x41,
    /** Buttons and modifiers of the selected view, see `Z80_MOUSE_FLAGS`. */
    MOUSE_BUTTONS: 0x42,
    /** The mouse event counter, a byte that wraps: how a program tells a new event from an old one. */
    MOUSE_EVENTS: 0x43,

    /** Waits B hundredths of a second and answers 0; the GUI and Stop stay responsive meanwhile. */
    TIME_WAIT: 0x50,
    /** Waits for the next animation frame and answers 0: the pacing of an animated program. */
    TIME_FRAME: 0x51,
    /** One byte of the hundredths of a second since the run started; B selects the byte, 0 lowest. */
    TIME_NOW: 0x52
} as const

export type Z80PortName = keyof typeof Z80_PORTS

/** The peripheral a port belongs to. The documentation page and the agent prompt group by it. */
export type Z80PortGroup = 'console' | 'screen' | 'keyboard' | 'mouse' | 'time'

/**
 * The four groups of [ADR 0011](../../../../docs/adr/0011-z80-peripherals-through-the-port-map.md)
 * plus the console ports they extend, in the order the documentation shows them.
 */
export const Z80_PORT_GROUP_DOCS: {
    group: Z80PortGroup
    title: string
    range: string
    description: string
}[] = [
    {
        group: 'console',
        title: 'Console',
        range: '0x10 - 0x14',
        description:
            'The Terminal: one port per output format, and the input reads that pause the program until a line (or a keystroke on the Screen) is available. What is printed here is also drawn at the Screen’s text cursor, in 8 by 8 cells.'
    },
    {
        group: 'screen',
        title: 'Screen',
        range: '0x20 - 0x2A',
        description:
            'Drawing. Set the colors and the coordinates, then write one command to the command port; every coordinate is a byte, so the Screen is at most 256 by 256 pixels and is 256 by 192 until the program resizes it. Colors are one 3-3-2 byte.'
    },
    {
        group: 'keyboard',
        title: 'Keyboard',
        range: '0x30 - 0x33',
        description:
            'Input from the focused Screen, polled: whether a typed character is waiting (read it from the character port), whether a given key is held, and the last key pressed and released. Key codes are EASy68K’s, the same table every environment here uses: letters and digits are the ASCII code of their capital, 0x25 to 0x28 are the arrows left, up, right and down, 0x20 is the space bar and 0x0D is Enter.'
    },
    {
        group: 'mouse',
        title: 'Mouse',
        range: '0x40 - 0x43',
        description:
            'Pointing input over the Screen, polled, in the same logical pixels drawing uses. B selects which of the three views a read answers with: the current state, the state at the last button release, or the state at the last button press.'
    },
    {
        group: 'time',
        title: 'Program time',
        range: '0x50 - 0x52',
        description:
            'Waiting and elapsed time. A wait and a frame sync are reads that suspend the program without blocking the editor: the machine re-executes the `in` when the time has passed, so Stop still answers and the Screen still repaints. Testcases run on a virtual clock, where waits complete at once and time starts at zero.'
    }
]

/**
 * The operations of the Screen command port. One write runs one operation on the coordinates,
 * colors and pen width already written to the other ports — the Screen's own drawing operations,
 * the same ones EASy68K's tasks reach
 * ([ADR 0003](../../../../docs/adr/0003-preserve-simulator-graphics-conventions.md)).
 */
export const Z80_SCREEN_COMMANDS = {
    PIXEL: 0,
    LINE: 1,
    LINE_TO: 2,
    MOVE_TO: 3,
    RECTANGLE: 4,
    RECTANGLE_OUTLINE: 5,
    ELLIPSE: 6,
    ELLIPSE_OUTLINE: 7,
    FLOOD_FILL: 8,
    CLEAR: 9,
    RESIZE: 10,
    BUFFERING_ON: 11,
    BUFFERING_OFF: 12,
    PRESENT: 13,
    MODE_CELLS: 14,
    MODE_DRAWING: 15
} as const

export type Z80ScreenCommandName = keyof typeof Z80_SCREEN_COMMANDS

/** One row per command for the documentation page and the coding agent's prompt. */
export const Z80_SCREEN_COMMAND_DOCS: {
    name: Z80ScreenCommandName
    command: number
    description: string
}[] = [
    {
        name: 'PIXEL',
        command: Z80_SCREEN_COMMANDS.PIXEL,
        description: 'One pixel at (X, Y) in the pen color. The pen width does not apply.'
    },
    {
        name: 'LINE',
        command: Z80_SCREEN_COMMANDS.LINE,
        description:
            'A line from (X, Y) to (X2, Y2) in the pen color, leaving the drawing position at (X2, Y2).'
    },
    {
        name: 'LINE_TO',
        command: Z80_SCREEN_COMMANDS.LINE_TO,
        description:
            'A line from the drawing position to (X, Y), which becomes the new position: a polyline costs one command per point.'
    },
    {
        name: 'MOVE_TO',
        command: Z80_SCREEN_COMMANDS.MOVE_TO,
        description: 'Moves the drawing position to (X, Y) without drawing.'
    },
    {
        name: 'RECTANGLE',
        command: Z80_SCREEN_COMMANDS.RECTANGLE,
        description:
            'A rectangle from (X, Y) to (X2, Y2), filled with the fill color and outlined with the pen. The right and bottom edges are excluded, as they are in EASy68K.'
    },
    {
        name: 'RECTANGLE_OUTLINE',
        command: Z80_SCREEN_COMMANDS.RECTANGLE_OUTLINE,
        description: 'The same rectangle, outline only.'
    },
    {
        name: 'ELLIPSE',
        command: Z80_SCREEN_COMMANDS.ELLIPSE,
        description: 'The ellipse inscribed in that rectangle, filled and outlined like it.'
    },
    {
        name: 'ELLIPSE_OUTLINE',
        command: Z80_SCREEN_COMMANDS.ELLIPSE_OUTLINE,
        description: 'The same ellipse, outline only.'
    },
    {
        name: 'FLOOD_FILL',
        command: Z80_SCREEN_COMMANDS.FLOOD_FILL,
        description:
            'Spreads the fill color from (X, Y) over every pixel of the color that was there, four ways.'
    },
    {
        name: 'CLEAR',
        command: Z80_SCREEN_COMMANDS.CLEAR,
        description:
            'Fills the whole Screen with the fill color, homes the text cursor, and adopts that color as the background, so scrolled text rows and a later resize match what is on screen.'
    },
    {
        name: 'RESIZE',
        command: Z80_SCREEN_COMMANDS.RESIZE,
        description:
            'Resizes the Screen to X by Y pixels and clears it; a coordinate of 0 means 256, the largest size a byte cannot hold.'
    },
    {
        name: 'BUFFERING_ON',
        command: Z80_SCREEN_COMMANDS.BUFFERING_ON,
        description:
            'Double buffering on: drawing goes to an off-screen copy of the visible image until PRESENT, so an animation never shows a half-drawn frame.'
    },
    {
        name: 'BUFFERING_OFF',
        command: Z80_SCREEN_COMMANDS.BUFFERING_OFF,
        description:
            'Double buffering off: drawing appears immediately. The off-screen image is dropped without being shown.'
    },
    {
        name: 'PRESENT',
        command: Z80_SCREEN_COMMANDS.PRESENT,
        description:
            'Shows the off-screen image. With double buffering off it only asks for a repaint.'
    },
    {
        name: 'MODE_CELLS',
        command: Z80_SCREEN_COMMANDS.MODE_CELLS,
        description:
            "The TRS-80's memory-mapped display: the Screen becomes 64 by 16 character cells and shows the kilobyte of memory at 0x3C00, one byte per cell. Characters 128 to 191 are 2 by 3 blocks, for 128 by 48 chunky pixels, and the keyboard matrix at 0x3800 answers reads. The drawing commands above are not available in this mode; a program draws by storing bytes. The same mode a `; @screen trs80` comment asks for before the program starts."
    },
    {
        name: 'MODE_DRAWING',
        command: Z80_SCREEN_COMMANDS.MODE_DRAWING,
        description:
            'Back to the drawing commands above. The image stays as it is until something draws on it, and memory at 0x3C00 becomes ordinary RAM again.'
    }
]

/**
 * Which snapshot a mouse read answers with, in B. The numbers are EASy68K's task 61 modes, so a
 * program (or a reader) moving between the two environments finds the same three views.
 */
export const Z80_MOUSE_VIEWS = {
    /** Where the pointer is now and which buttons are down now. */
    CURRENT: 0,
    /** The state at the last button release, which persists until the next one. */
    LAST_UP: 1,
    /** The state at the last button press, with the double-click flag. */
    LAST_DOWN: 2
} as const

/**
 * The bits of the mouse buttons port. The layout is EASy68K's task 61 flags byte — Ctrl, Alt,
 * Shift, Double, Middle, Right, Left written from the high bit down — so the two environments
 * report a click the same way.
 */
export const Z80_MOUSE_FLAGS = {
    LEFT: 0x01,
    RIGHT: 0x02,
    MIDDLE: 0x04,
    /** Only ever set in the last-press view: the press came within the double-click interval. */
    DOUBLE: 0x08,
    SHIFT: 0x10,
    ALT: 0x20,
    CTRL: 0x40
} as const

/**
 * Colors worth naming in the 3-3-2 layout a color byte uses: three bits of red in bits 7-5, three
 * of green in bits 4-2 and two of blue in bits 1-0. The adapter expands each field to eight bits by
 * repeating it, so 0xFF is pure white and 0xE0 pure red. The two grays are the nearest the two blue
 * bits allow, which is why they are not exactly neutral.
 */
export const Z80_COLORS = {
    BLACK: 0x00,
    BLUE: 0x03,
    GREEN: 0x1c,
    CYAN: 0x1f,
    RED: 0xe0,
    MAGENTA: 0xe3,
    YELLOW: 0xfc,
    WHITE: 0xff,
    ORANGE: 0xf0,
    GRAY: 0x92,
    DARK_GRAY: 0x49
} as const

export type Z80ColorName = keyof typeof Z80_COLORS

/** How a color byte is laid out, for the documentation page's color table. */
export const Z80_COLOR_FIELDS = [
    { name: 'red', bits: 3, mask: 0xe0, shift: 5 },
    { name: 'green', bits: 3, mask: 0x1c, shift: 2 },
    { name: 'blue', bits: 2, mask: 0x03, shift: 0 }
]

/**
 * Human descriptions of every port, for the I/O documentation page, the hover provider and the
 * coding agent's prompt. Examples are runnable in the interactive editor: `exampleInput` is the
 * input the program consumes, `exampleOutput` the exact text it prints and `exampleShows` what it
 * leaves on the Screen, and a test assembles and runs every one of them.
 */
export type Z80PortDoc = {
    name: Z80PortName
    port: number
    group: Z80PortGroup
    title: string
    write: string
    read: string
    example?: string
    /** Lines the example's input reads consume, so its documented output is exact. */
    exampleInput?: string[]
    /** The exact text the example prints. */
    exampleOutput?: string
    /** What the example leaves on the Screen, or what it waits for, when that is the point of it. */
    exampleShows?: string
}

export const Z80_PORT_DOCS: Z80PortDoc[] = [
    {
        name: 'CHAR',
        port: Z80_PORTS.CHAR,
        group: 'console',
        title: 'Character',
        write: 'Prints the byte as a character (Latin-1) and draws it at the Screen’s text cursor. 0x0A prints a newline.',
        read: 'Returns the next character of the input line, pausing for input when the line has been consumed. The line ends with a newline character (0x0A). Once the program has touched a Screen, Keyboard or Mouse port the characters come from the focused Screen instead, one keystroke at a time, and are echoed at the text cursor.',
        example: `        .org 0x8000
        ld hl, msg
loop:   ld a, (hl)
        or a
        jr z, done
        out (0x10), a
        inc hl
        jr loop
done:   halt
msg:    .asciz "Hello!", 10   ; 10 is the newline: strings keep \\n literally`,
        exampleOutput: 'Hello!\n'
    },
    {
        name: 'NUMBER',
        port: Z80_PORTS.NUMBER,
        group: 'console',
        title: 'Unsigned number',
        write: 'Prints the byte as an unsigned decimal number, 0 to 255.',
        read: 'Reads a line, parses it as a decimal number and returns its low byte. Stops the program with an error when the line is not a number.',
        example: `        .org 0x8000
        in a, (0x11)       ; ask for a number
        add a, a        ; double it
        out (0x11), a      ; print it
        halt`,
        exampleInput: ['21'],
        exampleOutput: '42'
    },
    {
        name: 'SIGNED',
        port: Z80_PORTS.SIGNED,
        group: 'console',
        title: 'Signed number',
        write: 'Prints the byte as a signed decimal number, -128 to 127.',
        read: 'Same as the unsigned number port.',
        example: `        .org 0x8000
        ld a, 5
        sub 10
        out (0x12), a
        halt`,
        exampleOutput: '-5'
    },
    {
        name: 'HEX',
        port: Z80_PORTS.HEX,
        group: 'console',
        title: 'Hexadecimal',
        write: 'Prints the byte as two upper case hexadecimal digits.',
        read: 'Reads a line, parses it as a hexadecimal number (`0x`, `$` prefix or `h` suffix accepted) and returns its low byte.',
        example: `        .org 0x8000
        ld a, 255
        out (0x13), a
        halt`,
        exampleOutput: 'FF'
    },
    {
        name: 'WORD',
        port: Z80_PORTS.WORD,
        group: 'console',
        title: '16 bit number',
        write: 'Prints the 16 bit number made of the high byte of the port address (register B when using `out (c),r`) and the byte written, as an unsigned decimal number.',
        read: 'Same as the unsigned number port.',
        example: `        .org 0x8000
        ld hl, 1000
        ld b, h         ; high byte goes on the address bus
        ld c, 0x14      ; port number
        out (c), l      ; prints HL
        halt`,
        exampleOutput: '1000'
    },
    {
        name: 'SCREEN_PEN_COLOR',
        port: Z80_PORTS.SCREEN_PEN_COLOR,
        group: 'screen',
        title: 'Pen color',
        write: 'Sets the color of pixels, lines, outlines and text, as one 3-3-2 byte (`RRRGGGBB`).',
        read: 'The current pen color, back in 3-3-2.',
        example: `        .org 0x8000
        ld a, 0xE0      ; 111 000 00: pure red
        out (0x20), a   ; pen color
        ld a, 100
        out (0x23), a   ; X
        ld a, 50
        out (0x24), a   ; Y
        xor a           ; command 0: pixel
        out (0x27), a
        halt`,
        exampleShows: 'one red pixel at (100, 50).'
    },
    {
        name: 'SCREEN_FILL_COLOR',
        port: Z80_PORTS.SCREEN_FILL_COLOR,
        group: 'screen',
        title: 'Fill color',
        write: 'Sets the color the inside of a filled shape, a flood fill and a clear use, as one 3-3-2 byte.',
        read: 'The current fill color, back in 3-3-2.',
        example: `        .org 0x8000
        ld a, 0x1C      ; 000 111 00: pure green
        out (0x21), a   ; fill color
        ld a, 0xFF
        out (0x20), a   ; white pen for the outline
        ld a, 20
        out (0x23), a
        out (0x24), a   ; from (20, 20)
        ld a, 80
        out (0x25), a
        out (0x26), a   ; to (80, 80), right and bottom excluded
        ld a, 4         ; command 4: filled rectangle
        out (0x27), a
        halt`,
        exampleShows: 'a green square with a white outline, 60 by 60 pixels, at (20, 20).'
    },
    {
        name: 'SCREEN_PEN_WIDTH',
        port: Z80_PORTS.SCREEN_PEN_WIDTH,
        group: 'screen',
        title: 'Pen width',
        write: 'Sets how many pixels wide lines and outlines are, at least 1. A width of 0 is read as 1.',
        read: 'The current pen width.',
        example: `        .org 0x8000
        ld a, 5
        out (0x22), a   ; five pixels wide
        ld a, 10
        out (0x23), a
        out (0x24), a   ; from (10, 10)
        ld a, 200
        out (0x25), a
        ld a, 150
        out (0x26), a   ; to (200, 150)
        ld a, 1         ; command 1: line
        out (0x27), a
        halt`,
        exampleShows: 'a thick white diagonal line across the Screen.'
    },
    {
        name: 'SCREEN_X',
        port: Z80_PORTS.SCREEN_X,
        group: 'screen',
        title: 'X',
        write: 'The first X coordinate: the pixel, the start of a line, the left edge of a shape, the width of a resize.',
        read: 'The byte last written.',
        example: `        .org 0x8000
        ld a, 128
        out (0x23), a
        ld a, 96
        out (0x24), a   ; (128, 96), the middle of the default Screen
        ld a, 3         ; command 3: move to
        out (0x27), a
        ld a, 200
        out (0x23), a
        ld a, 20
        out (0x24), a
        ld a, 2         ; command 2: line to
        out (0x27), a
        halt`,
        exampleShows: 'a line from the middle of the Screen to (200, 20).'
    },
    {
        name: 'SCREEN_Y',
        port: Z80_PORTS.SCREEN_Y,
        group: 'screen',
        title: 'Y',
        write: 'The first Y coordinate, the companion of the X port, and the height of a resize.',
        read: 'The byte last written.'
    },
    {
        name: 'SCREEN_X2',
        port: Z80_PORTS.SCREEN_X2,
        group: 'screen',
        title: 'X2',
        write: 'The second X coordinate: the end of a line, the right edge of a shape. Unused by the one-point commands.',
        read: 'The byte last written.'
    },
    {
        name: 'SCREEN_Y2',
        port: Z80_PORTS.SCREEN_Y2,
        group: 'screen',
        title: 'Y2',
        write: 'The second Y coordinate, the companion of the X2 port.',
        read: 'The byte last written.'
    },
    {
        name: 'SCREEN_COMMAND',
        port: Z80_PORTS.SCREEN_COMMAND,
        group: 'screen',
        title: 'Command',
        write: 'Runs one drawing operation on the coordinates, colors and pen width already set. The commands are listed above.',
        read: 'The number of the last command run, 0 before the first one.',
        example: `        .org 0x8000
        ld a, 0x03      ; 000 000 11: pure blue
        out (0x21), a   ; fill color
        ld a, 9         ; command 9: clear to the fill color
        out (0x27), a
        ld a, 0xFC      ; 111 111 00: yellow
        out (0x21), a
        ld a, 60
        out (0x23), a
        ld a, 40
        out (0x24), a
        ld a, 196
        out (0x25), a
        ld a, 152
        out (0x26), a
        ld a, 6         ; command 6: filled ellipse
        out (0x27), a
        halt`,
        exampleShows: 'a yellow ellipse with a white outline on a blue Screen.'
    },
    {
        name: 'SCREEN_PIXEL',
        port: Z80_PORTS.SCREEN_PIXEL,
        group: 'screen',
        title: 'Pixel color',
        write: 'Ignored: the pixel is drawn with command 0, in the pen color.',
        read: 'The color of the pixel at (X, Y) as a 3-3-2 byte, read from the image being drawn on — the off-screen one while double buffering. Outside the Screen it reads as the background color.',
        example: `        .org 0x8000
        ld a, 0xE0
        out (0x20), a   ; red pen
        ld a, 8
        out (0x23), a
        out (0x24), a   ; (8, 8)
        xor a           ; command 0: pixel
        out (0x27), a
        in a, (0x28)    ; read the color back
        out (0x13), a      ; print it as hexadecimal
        halt`,
        exampleOutput: 'E0'
    },
    {
        name: 'SCREEN_CURSOR_COLUMN',
        port: Z80_PORTS.SCREEN_CURSOR_COLUMN,
        group: 'screen',
        title: 'Text cursor column',
        write: 'Moves the text cursor to a column, in 8 by 8 character cells: 0 to 31 on the default Screen. Out of range values are clamped.',
        read: 'The column the text cursor is on.',
        example: `        .org 0x8000
        ld a, 12
        out (0x29), a   ; column 12
        ld a, 8
        out (0x2A), a   ; row 8
        ld hl, msg
loop:   ld a, (hl)
        or a
        jr z, done
        out (0x10), a      ; the character port draws at the cursor
        inc hl
        jr loop
done:   halt
msg:    .asciz "HELLO"`,
        exampleOutput: 'HELLO',
        exampleShows: 'the same text on the Screen, at the eighth row.'
    },
    {
        name: 'SCREEN_CURSOR_ROW',
        port: Z80_PORTS.SCREEN_CURSOR_ROW,
        group: 'screen',
        title: 'Text cursor row',
        write: 'Moves the text cursor to a row, in 8 by 8 character cells: 0 to 23 on the default Screen. Out of range values are clamped.',
        read: 'The row the text cursor is on. Text scrolls the whole Screen up one cell row at the bottom, graphics included.'
    },
    {
        name: 'KEY_AVAILABLE',
        port: Z80_PORTS.KEY_AVAILABLE,
        group: 'keyboard',
        title: 'Typed input available',
        write: 'Ignored.',
        read: '1 when a character typed on the focused Screen is waiting to be read from the character port, else 0. During a testcase it answers for the scripted input instead, so a program that polls before reading works in both.',
        example: `        .org 0x8000
wait:   in a, (0x30)    ; anything typed?
        or a
        jr z, wait      ; poll until there is
        in a, (0x10)    ; take the character
        out (0x10), a   ; print it
        halt`,
        exampleInput: ['hi'],
        exampleShows:
            'the first character typed on the Screen, echoed back. Click the Screen first: that is where the keys go.'
    },
    {
        name: 'KEY_STATE',
        port: Z80_PORTS.KEY_STATE,
        group: 'keyboard',
        title: 'Key state',
        write: 'Ignored.',
        read: '1 while the key whose code is in B is held down, else 0. This is how a game reads WASD or the arrows: it never consumes anything, and a key held over several reads answers 1 every time.',
        example: `        .org 0x8000
        ld c, 0x31      ; the key state port
        ld b, 0x27      ; the right arrow
wait:   in a, (c)
        or a
        jr z, wait      ; poll until it is held
        ld a, 'R'
        out (0x10), a
        halt`,
        exampleShows: 'an R printed once the right arrow is held down on the focused Screen.'
    },
    {
        name: 'KEY_LAST_DOWN',
        port: Z80_PORTS.KEY_LAST_DOWN,
        group: 'keyboard',
        title: 'Last key pressed',
        write: 'Ignored.',
        read: 'The code of the last key pressed on the Screen, 0 before the first press. It persists, so a program that polls slowly still sees the key.',
        example: `        .org 0x8000
loop:   in a, (0x32)    ; the last key pressed
        or a
        jr z, loop
        out (0x13), a      ; print its code in hexadecimal
        halt`,
        exampleShows: 'the code of the first key pressed on the focused Screen, in hexadecimal.'
    },
    {
        name: 'KEY_LAST_UP',
        port: Z80_PORTS.KEY_LAST_UP,
        group: 'keyboard',
        title: 'Last key released',
        write: 'Ignored.',
        read: 'The code of the last key released, 0 before the first release. With the last-pressed port it is the pair EASy68K’s task 19 answers with.'
    },
    {
        name: 'MOUSE_X',
        port: Z80_PORTS.MOUSE_X,
        group: 'mouse',
        title: 'Mouse X',
        write: 'Ignored.',
        read: 'The X of the view selected by B (0 current, 1 last release, 2 last press), in logical Screen pixels from the left edge, independently of how the panel is zoomed.',
        example: `        .org 0x8000
        ld c, 0x42      ; the buttons port
        ld b, 0         ; view 0: the current state
wait:   in a, (c)
        and 1           ; the left button
        jr z, wait
        ld c, 0x40
        in a, (c)       ; X
        out (0x11), a
        ld a, ','
        out (0x10), a
        ld c, 0x41
        in a, (c)       ; Y
        out (0x11), a
        halt`,
        exampleShows:
            'the pointer position printed as "x,y" as soon as the left button is held over the Screen.'
    },
    {
        name: 'MOUSE_Y',
        port: Z80_PORTS.MOUSE_Y,
        group: 'mouse',
        title: 'Mouse Y',
        write: 'Ignored.',
        read: 'The Y of the view selected by B, in logical Screen pixels from the top edge.'
    },
    {
        name: 'MOUSE_BUTTONS',
        port: Z80_PORTS.MOUSE_BUTTONS,
        group: 'mouse',
        title: 'Mouse buttons',
        write: 'Ignored.',
        read: 'The buttons and modifiers of the view selected by B: bit 0 left, bit 1 right, bit 2 middle, bit 3 the double-click flag (only in the last-press view), bit 4 Shift, bit 5 Alt, bit 6 Ctrl.'
    },
    {
        name: 'MOUSE_EVENTS',
        port: Z80_PORTS.MOUSE_EVENTS,
        group: 'mouse',
        title: 'Mouse event count',
        write: 'Ignored.',
        read: 'For the current view, how many mouse events have happened, as a byte that wraps around; for the two snapshot views, the count at the moment of the snapshot, 0 when it has not happened yet. Comparing it with the previous read is how a program tells a new click from the one it already handled.'
    },
    {
        name: 'TIME_WAIT',
        port: Z80_PORTS.TIME_WAIT,
        group: 'time',
        title: 'Wait',
        write: 'Ignored.',
        read: 'Waits B hundredths of a second, then answers 0. The editor stays responsive and Stop still works: the machine simply re-executes the `in` when the time is up. In a testcase the wait completes at once.',
        example: `        .org 0x8000
        ld c, 0x50
        ld b, 25        ; a quarter of a second
        in a, (c)
        ld a, '!'
        out (0x10), a
        halt`,
        exampleOutput: '!'
    },
    {
        name: 'TIME_FRAME',
        port: Z80_PORTS.TIME_FRAME,
        group: 'time',
        title: 'Frame sync',
        write: 'Ignored.',
        read: 'Waits for the next animation frame, then answers 0. One read per frame is how an animation runs at the display’s own pace instead of as fast as the host can go; with double buffering, present the frame first and sync afterwards.',
        example: `        .org 0x8000
        ld b, 10        ; ten frames
loop:   push bc
        in a, (0x51)    ; wait for the next frame
        ld a, '.'
        out (0x10), a
        pop bc
        djnz loop
        halt`,
        exampleOutput: '..........'
    },
    {
        name: 'TIME_NOW',
        port: Z80_PORTS.TIME_NOW,
        group: 'time',
        title: 'Elapsed time',
        write: 'Ignored.',
        read: 'One byte of the number of hundredths of a second since the run started, selected by B: 0 the lowest byte, 3 the highest. A testcase reads a virtual clock that starts at zero and only moves when the program waits, so a test is reproducible.',
        example: `        .org 0x8000
        ld c, 0x50
        ld b, 10        ; wait a tenth of a second
        in a, (c)
        ld c, 0x52
        ld b, 0         ; the lowest byte of the elapsed hundredths
        in a, (c)
        out (0x11), a
        halt`,
        exampleShows: 'the hundredths of a second the program has been running, about 10.'
    }
]

const PORT_GROUP_BY_NAME = new Map<Z80PortName, Z80PortGroup>(
    Z80_PORT_DOCS.map((doc) => [doc.name, doc.group])
)

/**
 * The peripheral a port belongs to. Derived from the documentation table so a port cannot be
 * decoded into a group the documentation does not describe; a test pins that every port has a row.
 */
export function z80PortGroupOf(name: Z80PortName): Z80PortGroup {
    return PORT_GROUP_BY_NAME.get(name) ?? 'console'
}
