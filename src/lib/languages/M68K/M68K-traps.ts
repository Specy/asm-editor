/**
 * The `trap #15` task table: which of EASy68K's I/O tasks this editor implements, what each one
 * takes and answers in the registers, and which ones stop the program with an error. One source for
 * the documentation page, the coding agent's prompt and the adapter's error messages, so none of the
 * three can drift away from what `M68KEmulator.svelte.ts` actually does.
 *
 * The interface itself is EASy68K's, preserved rather than redesigned
 * ([ADR 0003](../../../../docs/adr/0003-preserve-simulator-graphics-conventions.md)); the reference
 * is the EASy68K help, whose Text I/O, Graphics, Peripheral I/O and Simulator Environment pages this
 * table is grouped like. Deviations are named on the rows that have them.
 *
 * Plain data with no Svelte and no app aliases, like `Z80-model.ts`, so a documentation route can
 * import it while prerendering and a probe can import it under node.
 */

import { KEY_CODES } from '../peripherals/keyCodes'
import { rgb, type ScreenColor } from '../peripherals/screen/color'

export type M68KTrapGroup = 'text' | 'graphics' | 'input' | 'time'

/** The groups the documentation page and the coding agent's prompt show, in that order. */
export const M68K_TRAP_GROUP_DOCS: {
    group: M68KTrapGroup
    title: string
    description: string
}[] = [
    {
        group: 'text',
        title: 'Text I/O',
        description:
            'Printing and reading. Everything printed is appended to the terminal transcript **and** drawn on the screen at the text cursor, because EASy68K has one output window where text and graphics share the image; the transcript is what testcases assert on. Typed input is echoed to both.'
    },
    {
        group: 'graphics',
        title: 'Graphics',
        description:
            'Drawing on the screen. The origin is the top left, coordinates are pixels, and drawing outside the screen is ignored. Colors are `$00BBGGRR` longs, the same encoding EASy68K uses, so its color equates are unchanged. Rectangles and ellipses exclude their right and bottom edges, as they do in EASy68K, which draws them through the Windows GDI.'
    },
    {
        group: 'input',
        title: 'Keyboard and mouse',
        description:
            'Polled input from the focused screen. Key codes are EASy68K’s, which every environment in this editor uses. There are no input interrupts: a program asks for the state it wants when it wants it (tasks 60 and 62 are therefore not supported).'
    },
    {
        group: 'time',
        title: 'Program time',
        description:
            'Waiting and reading the clock. A delay suspends the program without blocking the editor, so Stop still answers and the screen still repaints while it runs. Testcases run on a virtual clock, where a delay completes at once and the clock starts at zero.'
    }
]

export type M68KTrapDoc = {
    task: number
    group: M68KTrapGroup
    title: string
    /** What the program puts in the registers before `trap #15`, `D0` excluded. */
    input?: string
    /** What the task leaves in the registers. */
    output?: string
    description: string
    /** Where this editor departs from EASy68K, when it does. */
    deviation?: string
}

/**
 * Every supported task, in EASy68K's numbering. The order is the numbering, so a reader coming from
 * the EASy68K help finds a task where it expects it.
 */
export const M68K_TRAP_DOCS: M68KTrapDoc[] = [
    {
        task: 0,
        group: 'text',
        title: 'Display string with CR, LF',
        input: 'A1 = string address, D1.W = length',
        description:
            'Displays up to D1.W characters of the string at (A1), stopping at a NULL, then a new line. See task 13 for the NULL terminated form.'
    },
    {
        task: 1,
        group: 'text',
        title: 'Display string',
        input: 'A1 = string address, D1.W = length',
        description:
            'Displays up to D1.W characters of the string at (A1) without a new line. See task 14 for the NULL terminated form.'
    },
    {
        task: 2,
        group: 'text',
        title: 'Read string',
        input: 'A1 = buffer address',
        output: 'The NULL terminated string at (A1), D1.W = its length',
        description:
            'Reads a line of input. With a screen keyboard the line is typed on the screen and ends with Enter; otherwise the editor asks for it, and a testcase answers it from its scripted input.'
    },
    {
        task: 3,
        group: 'text',
        title: 'Display signed number',
        input: 'D1.L = number',
        description: 'Displays D1.L in decimal, in the smallest field it fits. See tasks 15 and 20.'
    },
    {
        task: 4,
        group: 'text',
        title: 'Read number',
        output: 'D1.L = number',
        description: 'Reads a line and parses it as a decimal number.'
    },
    {
        task: 5,
        group: 'text',
        title: 'Read character',
        output: 'D1.B = ASCII code',
        description:
            'Reads one character. With a screen keyboard it is taken as soon as it is typed, without waiting for Enter; check task 7 first to poll instead of waiting.'
    },
    {
        task: 6,
        group: 'text',
        title: 'Display character',
        input: 'D1.B = ASCII code',
        description: 'Displays one character.'
    },
    {
        task: 7,
        group: 'input',
        title: 'Check for keyboard input',
        output: 'D1.B = 1 when a character is waiting, 0 otherwise',
        description:
            'Polls without consuming anything: the character it reports is the one task 5 or task 2 reads next. A testcase reports its remaining scripted input the same way.'
    },
    {
        task: 8,
        group: 'time',
        title: 'Get time',
        output: 'D1.L = hundredths of a second',
        description: 'The time the program has been running, in hundredths of a second.',
        deviation:
            'EASy68K counts from midnight; here the clock starts at zero when the run starts, and a testcase’s virtual clock does too. Programs measure elapsed time by subtracting two reads, which is unchanged.'
    },
    {
        task: 9,
        group: 'text',
        title: 'Terminate',
        description: 'Ends the program.'
    },
    {
        task: 11,
        group: 'text',
        title: 'Set or get the text cursor, or clear the screen',
        input: 'D1.W = $FF00 to clear, $00FF to get, otherwise column in the high byte and row in the low byte',
        output: 'For $00FF, D1.W = column in the high byte, row in the low byte',
        description:
            'The text cursor is where printed text lands, in character cells counted from the top left. Clearing with $FF00 clears text and graphics together, since they share one image, and homes the cursor. Positions outside the screen are clamped to it.'
    },
    {
        task: 13,
        group: 'text',
        title: 'Display NULL terminated string with CR, LF',
        input: 'A1 = string address',
        description: 'Displays the NULL terminated string at (A1), then a new line.'
    },
    {
        task: 14,
        group: 'text',
        title: 'Display NULL terminated string',
        input: 'A1 = string address',
        description: 'Displays the NULL terminated string at (A1) without a new line.'
    },
    {
        task: 15,
        group: 'text',
        title: 'Display unsigned number in a base',
        input: 'D1.L = number, D2.B = base (2 to 36)',
        description: 'Displays D1.L as an unsigned number in the base in D2.B.'
    },
    {
        task: 17,
        group: 'text',
        title: 'Display string and number',
        input: 'A1 = string address, D1.L = number',
        description: 'Task 14 then task 3: the NULL terminated string, then the signed number.'
    },
    {
        task: 18,
        group: 'text',
        title: 'Display string and read number',
        input: 'A1 = string address',
        output: 'D1.L = number',
        description: 'Task 14 then task 4: the NULL terminated string as a prompt, then a number.'
    },
    {
        task: 19,
        group: 'input',
        title: 'Get key state',
        input: 'D1.L = four key codes, or 0 for the last keys',
        output: 'D1.L = four $FF/$00 bytes, or the last key up in the high word and the last key down in the low word',
        description:
            'Reads whether up to four keys are held right now, one byte of the answer per key code in the same order; with D1.L = 0 it answers with the last key released and the last key pressed instead. A key held down is reported at least once however briefly it was tapped, so a polling loop never misses one.'
    },
    {
        task: 20,
        group: 'text',
        title: 'Display signed number in a field',
        input: 'D1.L = number, D2.B = field width',
        description:
            'Task 3 right justified in a field D2.B columns wide. A number too long for the field is displayed in full.'
    },
    {
        task: 23,
        group: 'time',
        title: 'Delay',
        input: 'D1.L = hundredths of a second',
        description:
            'Lets D1.L hundredths of a second of program time pass. The editor stays responsive throughout, and the screen is repainted, so this is how an animation paces itself.',
        deviation:
            'A testcase runs on a virtual clock: the delay completes immediately and advances that clock instead of waiting.'
    },
    {
        task: 24,
        group: 'input',
        title: 'Enable or disable the simulator shortcut keys',
        input: 'D1.L = 0 to enable, 1 to disable',
        description:
            'Accepted and ignored: the screen panel already hands every key it takes to the program, so there are no simulator shortcuts to give up.'
    },
    {
        task: 33,
        group: 'graphics',
        title: 'Set or get the screen size',
        input: 'D1.L = width in the high word and height in the low word, or 0 to get, 1 for windowed, 2 for full screen',
        output: 'For D1.L = 0, D1.L = width in the high word, height in the low word',
        description:
            'Resizes the screen and clears it. The minimum is EASy68K’s 640 by 480, which is also the size a program starts with. The windowed and full screen requests are accepted and ignored, since the screen is a panel in the editor.'
    },
    {
        task: 61,
        group: 'input',
        title: 'Read the mouse',
        input: 'D1.B = 0 for the current state, 1 for the last button release, 2 for the last button press',
        output: 'D0.B = Ctrl, Alt, Shift, Double, Middle, Right, Left from bit 6 down; D1.L = Y in the high word, X in the low word',
        description:
            'The pointer position is in screen pixels with the same origin drawing uses, whatever the panel’s zoom. The release and press states persist until the next one, so a program that polls slowly still sees every click; the double bit is only ever set on a press.'
    },
    {
        task: 80,
        group: 'graphics',
        title: 'Set pen color',
        input: 'D1.L = color as $00BBGGRR',
        description: 'The color lines, outlines, pixels and text are drawn in.'
    },
    {
        task: 81,
        group: 'graphics',
        title: 'Set fill color',
        input: 'D1.L = color as $00BBGGRR',
        description:
            'The color the insides of rectangles and ellipses and a flood fill are drawn in.'
    },
    {
        task: 82,
        group: 'graphics',
        title: 'Draw pixel',
        input: 'D1.W = X, D2.W = Y',
        description:
            'One pixel in the pen color. The pen width does not apply and the drawing point does not move.'
    },
    {
        task: 83,
        group: 'graphics',
        title: 'Get pixel color',
        input: 'D1.W = X, D2.W = Y',
        output: 'D0.L = color as $00BBGGRR',
        description:
            'Reads the pixel of the image being drawn on, which with double buffering is the off screen one. Outside the screen it answers with the background color.'
    },
    {
        task: 84,
        group: 'graphics',
        title: 'Draw line',
        input: 'D1.W = X1, D2.W = Y1, D3.W = X2, D4.W = Y2',
        description: 'A line in the pen color, leaving the drawing point at X2, Y2.'
    },
    {
        task: 85,
        group: 'graphics',
        title: 'Draw line to',
        input: 'D1.W = X, D2.W = Y',
        description:
            'A line in the pen color from the drawing point to X, Y, which becomes the new drawing point: a polyline is one task per point.'
    },
    {
        task: 86,
        group: 'graphics',
        title: 'Move to',
        input: 'D1.W = X, D2.W = Y',
        description: 'Moves the drawing point without drawing.'
    },
    {
        task: 87,
        group: 'graphics',
        title: 'Draw rectangle',
        input: 'D1.W = left X, D2.W = upper Y, D3.W = right X, D4.W = lower Y',
        description:
            'Filled with the fill color and outlined with the pen. The right and bottom edges are excluded, so a rectangle whose edges meet draws nothing.'
    },
    {
        task: 88,
        group: 'graphics',
        title: 'Draw ellipse',
        input: 'D1.W = left X, D2.W = upper Y, D3.W = right X, D4.W = lower Y',
        description:
            'The ellipse inscribed in that rectangle, filled with the fill color and outlined with the pen. A square bounding rectangle draws a circle.'
    },
    {
        task: 89,
        group: 'graphics',
        title: 'Flood fill',
        input: 'D1.W = X, D2.W = Y',
        description:
            'Spreads the fill color from X, Y over every neighbouring pixel of the color that was there, four ways.'
    },
    {
        task: 90,
        group: 'graphics',
        title: 'Draw unfilled rectangle',
        input: 'D1.W = left X, D2.W = upper Y, D3.W = right X, D4.W = lower Y',
        description: 'The outline of task 87 in the pen color, with nothing inside.'
    },
    {
        task: 91,
        group: 'graphics',
        title: 'Draw unfilled ellipse',
        input: 'D1.W = left X, D2.W = upper Y, D3.W = right X, D4.W = lower Y',
        description: 'The outline of task 88 in the pen color, with nothing inside.'
    },
    {
        task: 92,
        group: 'graphics',
        title: 'Set drawing mode',
        input: 'D1.B = 2, 4, 16 or 17',
        description:
            'Mode 4 draws normally and is the default; mode 2 moves the drawing point without changing any pixel; mode 16 turns double buffering off and mode 17 turns it on, so drawing goes to an off screen image until task 94 shows it.',
        deviation:
            'EASy68K’s bitwise modes (0, 1, 3 and 5 to 15) stop the program with an error naming the mode. Double buffering covers the sprite erasing use of the XOR mode.'
    },
    {
        task: 93,
        group: 'graphics',
        title: 'Set pen width',
        input: 'D1.B = width in pixels',
        description:
            'The width of lines and of the outlines of rectangles and ellipses. A single pixel (task 82) ignores it.'
    },
    {
        task: 94,
        group: 'graphics',
        title: 'Repaint the screen',
        description:
            'Shows the off screen image drawn under mode 17. With double buffering off it does nothing but ask for a repaint.'
    },
    {
        task: 95,
        group: 'graphics',
        title: 'Draw text at a pixel position',
        input: 'A1 = NULL terminated string, D1.W = X, D2.W = Y',
        description:
            'Draws the string in the pen color with its top left corner at X, Y, over whatever is already there, so a label can sit on a drawing. Control characters are ignored. Text printed with the text tasks lands at the text cursor instead (task 11).'
    },
    {
        task: 96,
        group: 'graphics',
        title: 'Get the drawing point',
        output: 'D1.W = X, D2.W = Y',
        description: 'Where the next line-to would start.'
    }
]

/**
 * The tasks that stop the program with an error naming them. Every one of them either drives
 * hardware this editor does not have (a printer, the cycle counter, the hardware window) or
 * configures something the editor decides for itself (fonts, echo, the input prompt, interrupts).
 * The reasons are what the error message says, so a user reads why rather than only what.
 */
export const M68K_REJECTED_TRAP_TASKS: { task: number; title: string; reason: string }[] = [
    { task: 10, title: 'print to the printer', reason: 'the editor has no printer' },
    {
        task: 12,
        title: 'keyboard echo',
        reason: 'typed input is always echoed, the way a terminal does it'
    },
    {
        task: 16,
        title: 'display properties',
        reason: 'the editor’s input prompt is not a program setting'
    },
    {
        task: 21,
        title: 'font properties',
        reason: 'the screen draws text in one fixed cell font'
    },
    {
        task: 22,
        title: 'read a character from the text screen',
        reason: 'the screen holds pixels, not a grid of characters'
    },
    {
        task: 25,
        title: 'scroll a text rectangle',
        reason: 'the screen holds pixels, not a grid of characters'
    },
    { task: 30, title: 'clear the cycle counter', reason: 'no cycle counting is emulated' },
    { task: 31, title: 'read the cycle counter', reason: 'no cycle counting is emulated' },
    {
        task: 32,
        title: 'hardware and simulator control',
        reason: 'there is no hardware window and no automatic IRQ'
    },
    {
        task: 60,
        title: 'enable the mouse IRQ',
        reason: 'mouse input is polled with task 61, not delivered as an interrupt'
    },
    {
        task: 62,
        title: 'enable the keyboard IRQ',
        reason: 'keyboard input is polled with tasks 7 and 19, not delivered as an interrupt'
    }
]

const REJECTED_BY_TASK = new Map(M68K_REJECTED_TRAP_TASKS.map((doc) => [doc.task, doc]))

/**
 * What the Core says when it meets a task it does not decode, said better. The Core knows only the
 * number; this knows whether the number is a task the editor deliberately does not support, and
 * says why, which is the difference between a dead end and a documented one.
 */
export function describeUnsupportedTrapTask(task: number): string {
    const rejected = REJECTED_BY_TASK.get(task)
    if (rejected) {
        return `Trap task ${task} (${rejected.title}) is not supported: ${rejected.reason}`
    }
    return `Trap task ${task} is not a supported trap #15 task`
}

/**
 * The mouse flags byte of task 61, `Ctrl, Alt, Shift, Double, Middle, Right, Left` written from the
 * high bit down, so bit 0 is the left button. The Z80's mouse port reuses the same layout
 * (`Z80_MOUSE_FLAGS`), which is why a click is described identically in the two environments.
 */
export const M68K_MOUSE_FLAGS = {
    LEFT: 0x01,
    RIGHT: 0x02,
    MIDDLE: 0x04,
    DOUBLE: 0x08,
    SHIFT: 0x10,
    ALT: 0x20,
    CTRL: 0x40
} as const

/** EASy68K's mouse read modes, task 61's D1.B. */
export const M68K_MOUSE_MODES = {
    CURRENT: 0,
    LAST_UP: 1,
    LAST_DOWN: 2
} as const

/** EASy68K's drawing modes, task 92's D1.B, of which only these four reach the editor. */
export const M68K_DRAWING_MODES = {
    MOVE_WITHOUT_DRAWING: 2,
    DRAW: 4,
    DOUBLE_BUFFERING_OFF: 16,
    DOUBLE_BUFFERING_ON: 17
} as const

/** EASy68K's smallest output window, which task 33 will not go below. */
export const M68K_MIN_SCREEN_WIDTH = 640
export const M68K_MIN_SCREEN_HEIGHT = 480

/** A `$00BBGGRR` color, as EASy68K's tasks carry it, as the Screen's `0xRRGGBB`. */
export function screenColorOf(easy68kColor: number): ScreenColor {
    return rgb(easy68kColor & 0xff, (easy68kColor >> 8) & 0xff, (easy68kColor >> 16) & 0xff)
}

/** The Screen's `0xRRGGBB` back as the `$00BBGGRR` long task 83 answers with. */
export function easy68kColorOf(color: ScreenColor): number {
    return ((color & 0xff) << 16) | (color & 0xff00) | ((color >> 16) & 0xff)
}

/** EASy68K's color equates, which its examples use by name; shown on the documentation page. */
export const M68K_COLORS = {
    BLACK: 0x00000000,
    MAROON: 0x00000080,
    GREEN: 0x00008000,
    OLIVE: 0x00008080,
    NAVY: 0x00800000,
    PURPLE: 0x00800080,
    TEAL: 0x00808000,
    GRAY: 0x00808080,
    RED: 0x000000ff,
    LIME: 0x0000ff00,
    YELLOW: 0x0000ffff,
    BLUE: 0x00ff0000,
    FUCHSIA: 0x00ff00ff,
    AQUA: 0x00ffff00,
    LTGRAY: 0x00c0c0c0,
    WHITE: 0x00ffffff
} as const

/**
 * The key codes task 19 works in, for the documentation page. The numbers come from `keyCodes.ts`,
 * which is EASy68K's own table and the one every environment in this editor uses; the rules at the
 * top are the ones that cover the keys not named here.
 */
export const M68K_KEY_CODE_RULES = [
    'A letter key is the ASCII code of its capital, so `A` is $41 and `Z` is $5A. Shift, Alt and Ctrl do not change it.',
    'A top row digit is its ASCII code, so `0` is $30 and `9` is $39.',
    'The function keys are contiguous from F1, so F1 is $70 and F12 is $7B.',
    'The keypad digits with Num Lock on are contiguous from $60.'
] as const

export const M68K_KEY_CODE_DOCS: { name: string; code: number }[] = [
    { name: 'Backspace', code: KEY_CODES.BACKSPACE },
    { name: 'Tab', code: KEY_CODES.TAB },
    { name: 'Enter', code: KEY_CODES.ENTER },
    { name: 'Shift', code: KEY_CODES.SHIFT },
    { name: 'Ctrl', code: KEY_CODES.CTRL },
    { name: 'Alt', code: KEY_CODES.ALT },
    { name: 'Caps Lock', code: KEY_CODES.CAPS_LOCK },
    { name: 'Esc', code: KEY_CODES.ESCAPE },
    { name: 'Space', code: KEY_CODES.SPACE },
    { name: 'Page Up', code: KEY_CODES.PAGE_UP },
    { name: 'Page Down', code: KEY_CODES.PAGE_DOWN },
    { name: 'End', code: KEY_CODES.END },
    { name: 'Home', code: KEY_CODES.HOME },
    { name: 'Left arrow', code: KEY_CODES.LEFT_ARROW },
    { name: 'Up arrow', code: KEY_CODES.UP_ARROW },
    { name: 'Right arrow', code: KEY_CODES.RIGHT_ARROW },
    { name: 'Down arrow', code: KEY_CODES.DOWN_ARROW },
    { name: 'Insert', code: KEY_CODES.INSERT },
    { name: 'Delete', code: KEY_CODES.DELETE },
    { name: 'Semicolon', code: KEY_CODES.SEMICOLON },
    { name: 'Equals', code: KEY_CODES.EQUALS },
    { name: 'Comma', code: KEY_CODES.COMMA },
    { name: 'Minus', code: KEY_CODES.MINUS },
    { name: 'Period', code: KEY_CODES.PERIOD },
    { name: 'Slash', code: KEY_CODES.SLASH },
    { name: 'Backquote', code: KEY_CODES.BACKQUOTE },
    { name: 'Open bracket', code: KEY_CODES.OPEN_BRACKET },
    { name: 'Backslash', code: KEY_CODES.BACKSLASH },
    { name: 'Close bracket', code: KEY_CODES.CLOSE_BRACKET },
    { name: 'Quote', code: KEY_CODES.QUOTE }
]
