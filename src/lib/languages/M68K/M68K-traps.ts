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

export type M68KTrapGroup = 'text' | 'graphics' | 'input' | 'time' | 'files'

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
            'Printing and reading. Everything printed is appended to the terminal transcript **and** drawn on the screen at the text cursor. Testcases compare the transcript. Typed input is echoed to both, unless task 12 turned echo off. Text uses Windows-1252 bytes: one byte per character, including `€` and curly quotes.'
    },
    {
        group: 'graphics',
        title: 'Graphics',
        description:
            'Drawing on the screen. The origin is the top left, coordinates are signed pixels, so a shape may start off the left or the top, and whatever falls outside the screen is clipped. Colors are `$00BBGGRR` longs. Rectangles and ellipses exclude their right and bottom edges.'
    },
    {
        group: 'input',
        title: 'Keyboard and mouse',
        description:
            'Polled input from the focused screen. There are no input interrupts: a program asks for the state it wants when it wants it (tasks 60 and 62 are therefore not supported).'
    },
    {
        group: 'time',
        title: 'Program time',
        description:
            'Waiting and reading the clock. A delay suspends the program without blocking the editor, so Stop still answers and the screen still repaints while it runs. Testcases run on a virtual clock, where a delay completes at once and the clock starts at zero.'
    },
    {
        group: 'files',
        title: 'Files',
        description:
            'Reading and writing the Project’s Files. A path is a NULL terminated string of at most 255 characters, from the Project root, with `/` or `\\` between its parts. At most eight files are open at once, numbered 0 to 7, and D0.W says how a task went: 0 success, 1 end of file, 2 error, 3 read only. Undo puts back what a file task changed, and each testcase works on its own copy of the Files.'
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
            'Displays D1.W characters of the string at (A1), at most 255, stopping early at a NULL, then a new line. See task 13 for the NULL terminated form.'
    },
    {
        task: 1,
        group: 'text',
        title: 'Display string',
        input: 'A1 = string address, D1.W = length',
        description:
            'Displays D1.W characters of the string at (A1), at most 255, stopping early at a NULL, without a new line. See task 14 for the NULL terminated form.'
    },
    {
        task: 2,
        group: 'text',
        title: 'Read string',
        input: 'A1 = buffer address',
        output: 'The NULL terminated string at (A1), D1.L = its length',
        description:
            'Reads a line of input, typed in the console, or on the screen once the program has used it, and ended with Enter; a testcase answers it from its scripted input. Its first 79 characters are stored, then a NULL. A character Windows-1252 has no byte for is stored as `?`.',
        deviation:
            'Only the first 79 characters are stored. Additional typed characters are dropped.'
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
        description:
            'Reads a line and converts it by skipping leading spaces, reading an optional sign, then taking digits up to the first other character. `12abc` is 12, and a line with no number, an empty one included, is 0, never an error.',
        deviation: 'A number too long for 32 bits keeps its low 32 bits.'
    },
    {
        task: 5,
        group: 'text',
        title: 'Read character',
        output: 'D1.B = the character, $0D for Enter',
        description:
            'Reads one key as soon as it is typed, without waiting for Enter, in the console or on the screen once the program has used it. Enter is `$0D`. Check task 7 first to poll instead of waiting.'
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
            'The clock starts at zero when a run starts. Programs can measure elapsed time by subtracting two reads.'
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
        task: 12,
        group: 'text',
        title: 'Keyboard echo',
        input: 'D1.B = 0 to turn the echo off, anything else to turn it on',
        description:
            'Whether input read by tasks 2, 4, 5 and 18 is echoed in the console and on the screen. With echo off, a line read still moves to a new line when Enter ends it, and a key read shows nothing. Echo is on when a program starts, and Undo restores the previous setting.'
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
        description:
            'Displays D1.L as an unsigned number in the base in D2.B, using upper case digits past 9: 255 in base 16 is `FF`.',
        deviation: 'A base outside 2 to 36 stops the program with an error naming D2.B.'
    },
    {
        task: 16,
        group: 'text',
        title: 'Input prompt and line feed',
        input: 'D1.B = 0 to hide the input prompt, 1 to show it, 2 to turn the line feed after Enter off, 3 to turn it on',
        description:
            'Controls the prompt shown while input is waiting and whether a key read of Enter adds a line feed. The waiting prompt appears as a caret and question in the console; the screen does not draw a flashing cursor. Without the line feed, Enter takes the screen text cursor back to the start of its line. Line and number reads always start a new line when Enter ends them, even with echo or line-feed settings off. Both settings are on when a program starts, and Undo restores the previous setting.',
        deviation: 'Any other D1.B value stops the program with an error naming the value.'
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
            'Task 3 right justified in a field D2.B columns wide. D2.B is signed, and a negative width left justifies the number in a field that wide instead. A number too long for the field is displayed in full.'
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
            'Resizes the screen and clears it. The minimum is 640 by 480, which is also the size a program starts with. Windowed and full-screen requests are accepted and ignored because the screen is an editor panel.'
    },
    {
        task: 50,
        group: 'files',
        title: 'Close all files',
        output: 'D0.W = 0',
        description: 'Closes every file the program has open.'
    },
    {
        task: 51,
        group: 'files',
        title: 'Open an existing file',
        input: 'A1 = NULL terminated path',
        output: 'D1.L = file number, or -1; D0.W = 0, 3 when it opened for reading only, 2 when it did not open',
        description:
            'Opens the File at the path for reading and writing, at its start. A path with no File, a Directory and a ninth open file are errors. A Project’s Files can all be written, so the read only result is for a File that some day cannot be.'
    },
    {
        task: 52,
        group: 'files',
        title: 'Open a new file',
        input: 'A1 = NULL terminated path',
        output: 'D1.L = file number, or -1; D0.W = 0, or 2 when it did not open',
        description:
            'Creates the File at the path, or empties the one that is there, and opens it for reading and writing. The Directories on its path are created with it.'
    },
    {
        task: 53,
        group: 'files',
        title: 'Read a file',
        input: 'D1.L = file number, A1 = buffer address, D2.L = byte count',
        output: 'D2.L = bytes read; D0.W = 0, 1 at the end of the file, 2 on an error',
        description:
            'Reads up to D2.L bytes from the file’s position into the buffer, and moves the position past them. Fewer bytes than asked for is a success, with their count in D2.L; none at all is the end of the file, which leaves D2.L as it was.',
        deviation:
            'A read of no bytes, D2.L = 0, reports 2, including when an earlier read reached the end of the file.'
    },
    {
        task: 54,
        group: 'files',
        title: 'Write a file',
        input: 'D1.L = file number, A1 = buffer address, D2.L = byte count',
        output: 'D0.W = 0, or 2 on an error',
        description:
            'Writes the D2.L bytes at (A1) at the file’s position, growing the File as needed, and moves the position past them. A write of no bytes, and one to a file opened for reading only, report 2.'
    },
    {
        task: 55,
        group: 'files',
        title: 'Position a file',
        input: 'D1.L = file number, D2.L = position',
        output: 'D0.W = 0, or 2 on an error',
        description:
            'Moves the file’s position to D2.L bytes from its start. A position past the end reads as the end of the file until a write there fills the gap with zeros; a negative one is an error.'
    },
    {
        task: 56,
        group: 'files',
        title: 'Close a file',
        input: 'D1.L = file number',
        output: 'D0.W = 0, or 2 when it was not open',
        description: 'Closes the file, so that its number can be given to the next one opened.'
    },
    {
        task: 57,
        group: 'files',
        title: 'Delete a file',
        input: 'A1 = NULL terminated path',
        output: 'D0.W = 0, or 2 when there is no File there',
        description:
            'Removes the File at the path from the Project. A file the program still has open stays readable and writable through its number until it is closed.',
        deviation:
            'A file can be deleted while it is open and remains readable through its file number until closed.'
    },
    {
        task: 58,
        group: 'files',
        title: 'File dialog',
        input: 'D1.L = 0 to open, 1 to save; A1 = title, A2 = filter, either 0 for none; A3 = a 256 byte buffer',
        output: 'The path chosen at (A3), NULs to 256 bytes; D1.L = 1, or 0 when the dialog was cancelled; D0.W = 0, or 2 when the buffer runs past the end of memory',
        description:
            'Asks for the path of a File, for the program to open with task 51 or create with task 52. Cancel, or an empty answer, leaves (A3) alone and puts 0 in D1.L. A testcase answers it with its next scripted input.',
        deviation:
            'Shows a text prompt naming the title and asking for a path from the Project root. A D1.L other than 0 or 1 stops the program with an error naming the value.'
    },
    {
        task: 59,
        group: 'files',
        title: 'Check that a file exists',
        input: 'A1 = NULL terminated path',
        output: 'D0.W = 0 when the File can be written, 3 when it can only be read, 2 when there is none',
        description: 'Whether there is a File at the path. A Directory is not one, so it answers 2.'
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
            'Bitwise modes (0, 1, 3 and 5 to 15) stop the program with an error naming the mode. Double buffering is available for drawing animated sprites.'
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

/** Why the cycle counter is rejected, which [the plan's decision 9](../../../../docs/design/environment-library-plan.md) settles. */
const NO_CYCLE_TIMING =
    'counting the 68000’s clock cycles needs a timing model of the processor, which the emulator does not have yet'
const NO_TEXT_GRID = 'the screen holds pixels, not a grid of characters'
const NO_SERIAL_PORT = 'the editor does not expose serial devices through its Peripherals'
const NO_AUDIO = 'sound needs the Audio Peripheral, which the editor does not have yet'
const NO_NETWORK = 'a web page cannot open the network connections these tasks make'

/**
 * The tasks that stop the program with an error naming them, each with the reason the error gives,
 * so a user reads why rather than only what. Each either drives something a page in a browser
 * cannot have (a printer, a serial port, the network), or something the editor does not have yet
 * (the cycle counter, sound), or configures what the editor decides for itself (fonts,
 * interrupts). Tasks 70 to 77 reach the editor and are refused there; the Core refuses the others
 * itself, as `UnsupportedTrapTask`.
 */
export const M68K_REJECTED_TRAP_TASKS: { task: number; title: string; reason: string }[] = [
    { task: 10, title: 'print to the printer', reason: 'the editor has no printer' },
    {
        task: 21,
        title: 'font properties',
        reason: 'the screen draws text in one fixed cell font'
    },
    { task: 22, title: 'read a character from the text screen', reason: NO_TEXT_GRID },
    { task: 25, title: 'scroll a text rectangle', reason: NO_TEXT_GRID },
    { task: 30, title: 'clear the cycle counter', reason: NO_CYCLE_TIMING },
    { task: 31, title: 'read the cycle counter', reason: NO_CYCLE_TIMING },
    {
        task: 32,
        title: 'hardware and simulator control',
        reason: 'there is no hardware window and no automatic IRQ'
    },
    { task: 40, title: 'initialize a serial port', reason: NO_SERIAL_PORT },
    { task: 41, title: 'set the serial port parameters', reason: NO_SERIAL_PORT },
    { task: 42, title: 'read a string from a serial port', reason: NO_SERIAL_PORT },
    { task: 43, title: 'send a string to a serial port', reason: NO_SERIAL_PORT },
    {
        task: 60,
        title: 'enable the mouse IRQ',
        reason: 'mouse input is polled with task 61, not delivered as an interrupt'
    },
    {
        task: 62,
        title: 'enable the keyboard IRQ',
        reason: 'keyboard input is polled with tasks 7 and 19, not delivered as an interrupt'
    },
    { task: 70, title: 'play a sound file', reason: NO_AUDIO },
    { task: 71, title: 'load a sound file', reason: NO_AUDIO },
    { task: 72, title: 'play a loaded sound', reason: NO_AUDIO },
    { task: 73, title: 'play a sound file with DirectX', reason: NO_AUDIO },
    { task: 74, title: 'load a sound file with DirectX', reason: NO_AUDIO },
    { task: 75, title: 'play a loaded DirectX sound', reason: NO_AUDIO },
    { task: 76, title: 'control the sound player', reason: NO_AUDIO },
    { task: 77, title: 'control the DirectX sound player', reason: NO_AUDIO },
    { task: 100, title: 'create a network client', reason: NO_NETWORK },
    { task: 101, title: 'create a network server', reason: NO_NETWORK },
    { task: 102, title: 'send over the network', reason: NO_NETWORK },
    { task: 103, title: 'receive from the network', reason: NO_NETWORK },
    { task: 104, title: 'close a network connection', reason: NO_NETWORK },
    { task: 105, title: 'get the local IP address', reason: NO_NETWORK },
    { task: 106, title: 'send on a network port', reason: NO_NETWORK },
    { task: 107, title: 'receive data and its port', reason: NO_NETWORK }
]

const REJECTED_BY_TASK = new Map(M68K_REJECTED_TRAP_TASKS.map((doc) => [doc.task, doc]))
const SUPPORTED_BY_TASK = new Map(M68K_TRAP_DOCS.map((doc) => [doc.task, doc]))

/**
 * Why the Core stopped at a task it does not carry out (`UnsupportedTrapTask`), or the editor at a
 * sound task. The Core knows only the number; this knows whether the number is a task the editor
 * deliberately does not support, and says why, which is the difference between a dead end and a
 * documented one.
 */
export function describeUnsupportedTrapTask(task: number): string {
    const rejected = REJECTED_BY_TASK.get(task)
    if (rejected) {
        return `Trap task ${task} (${rejected.title}) is not supported: ${rejected.reason}`
    }
    return `Trap task ${task} is not a supported trap #15 task`
}

/**
 * Why the Core stopped at a task that was given a value it cannot take (`InvalidTrapArgument`).
 * The Core's reason names the register and what the task takes, such as "D2.B is 37, and a base is
 * 2 to 36"; this names the task in front of it.
 */
export function describeInvalidTrapArgument(task: number, reason: string): string {
    const doc = SUPPORTED_BY_TASK.get(task)
    const title = doc ? ` (${doc.title[0].toLowerCase()}${doc.title.slice(1)})` : ''
    return `Trap task ${task}${title} was given a value it cannot take: ${reason}`
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
