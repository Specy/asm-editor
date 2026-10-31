/**
 * The keys of the **Terminal** as a serial terminal sends them, for the raw mode of the Line
 * discipline on x86 ([x86-devices.md](../../../../../../docs/design/x86-devices.md), The Terminal's
 * modes): what an xterm in its default modes puts on the line for each key, and how a Linux tty
 * echoes it.
 *
 * | Key                                 | Sent                                           |
 * | ----------------------------------- | ---------------------------------------------- |
 * | Text, typed, composed or pasted     | its characters (UTF-8 on x86)                  |
 * | Enter                               | `\r`, which the Core's `ICRNL` makes `\n`      |
 * | Backspace                           | DEL `0x7f`; Ctrl+Backspace `0x08`              |
 * | Tab, Escape                         | `0x09`, `0x1b`                                 |
 * | Arrows                              | `ESC [ A` to `D`                               |
 * | Home, End                           | `ESC [ H`, `ESC [ F`                           |
 * | Insert, Delete, PageUp, PageDown    | `ESC [ 2 ~`, `3 ~`, `5 ~`, `6 ~`               |
 * | F1 to F4                            | `ESC O P` to `S`                               |
 * | F5 to F12                           | `ESC [ 15 ~`, `17`–`21 ~`, `23 ~`, `24 ~`      |
 * | Ctrl+A to Ctrl+Z                    | `0x01` to `0x1a`                               |
 * | Ctrl+Space or @, [, \, ], ^, _ or / | `0x00`, `0x1b`, `0x1c`, `0x1d`, `0x1e`, `0x1f` |
 * | Ctrl+?                              | `0x7f`                                         |
 *
 * With Shift, Alt or Ctrl, the cursor, editing and function keys take xterm's modifier parameter,
 * 1 plus 1 for Shift, 2 for Alt and 4 for Ctrl: Ctrl+Up is `ESC [ 1 ; 5 A`, Shift+Delete
 * `ESC [ 3 ; 2 ~`. The cursor keys are always in normal mode, never DECCKM's application mode
 * (`ESC O A`), because the Terminal does not interpret what a program writes to switch it.
 *
 * Kept by the page rather than sent: Shift+Tab, which gives the keyboard back now that Escape is
 * the program's; Shift+PageUp and Shift+PageDown, which scroll the transcript as in xterm; Ctrl+V,
 * which pastes as in any field of the page (Linux's literal-next character, which only canonical
 * mode reads anyway); Ctrl+Shift combinations of letters (Ctrl+Shift+C copies, Ctrl+Shift+V
 * pastes); Alt with a character, which is no meta prefix; and every ⌘ combination.
 *
 * Plain TypeScript, like the other peripherals, so it runs under node in the tests.
 */

/** A key pressed in the console, named as a `KeyboardEvent` names it, which satisfies it. */
export type TerminalKeyPress = {
    readonly key: string
    readonly code: string
    readonly ctrlKey: boolean
    readonly altKey: boolean
    readonly shiftKey: boolean
    readonly metaKey: boolean
}

/**
 * The control characters `ISIG` acts on, at Linux's defaults (`c_cc`): a program that changes them
 * still gets these, a documented deviation, since the Core reports the flags and not the characters.
 */
export const INTERRUPT_CHARACTER = 0x03
export const QUIT_CHARACTER = 0x1c
export const SUSPEND_CHARACTER = 0x1a

/** The signals Ctrl+C and Ctrl+\ raise under `ISIG`, by their Linux numbers. */
export const SIGINT = 2
export const SIGQUIT = 3

const ESCAPE = '\x1b'
const DELETE = 0x7f
/** Ctrl+V, kept for pasting. */
const LITERAL_NEXT_CHARACTER = 0x16

/**
 * The control character Ctrl and a key type, or undefined when the combination types none: Ctrl+C
 * is `0x03`. A layout without Latin letters names a letter key by what it types, so its position
 * decides then, as for Ctrl+D's End of input. Ctrl with Alt is AltGr on Windows, which types text.
 */
export function controlCharacterOf(press: TerminalKeyPress): number | undefined {
    if (!press.ctrlKey || press.altKey || press.metaKey) return undefined
    const { key } = press
    if (/^[a-z]$/i.test(key)) return press.shiftKey ? undefined : letterControl(key)
    const position = /^Key([A-Z])$/.exec(press.code)
    if (position && /^\p{L}$/u.test(key)) {
        return press.shiftKey ? undefined : letterControl(position[1])
    }
    switch (key) {
        case ' ':
        case '@':
            return 0x00
        case '[':
            return 0x1b
        case '\\':
            return QUIT_CHARACTER
        case ']':
            return 0x1d
        case '^':
            return 0x1e
        case '_':
        case '/':
            return 0x1f
        case '?':
            return DELETE
    }
    return undefined
}

function letterControl(letter: string): number {
    return letter.toUpperCase().charCodeAt(0) & 0x1f
}

/**
 * What a key that is not text sends in raw mode, or null for one the page keeps (see the module's
 * table) or that types text, which the console's input event delivers: an IME, a dead key or a
 * phone's keyboard all end there.
 */
export function rawKeySequence(press: TerminalKeyPress): string | null {
    if (press.metaKey) return null
    const modifier = 1 + (press.shiftKey ? 1 : 0) + (press.altKey ? 2 : 0) + (press.ctrlKey ? 4 : 0)
    switch (press.key) {
        case 'Enter':
            return '\r'
        case 'Backspace':
            return press.ctrlKey ? '\b' : String.fromCharCode(DELETE)
        case 'Tab':
            return press.shiftKey ? null : '\t'
        case 'Escape':
            return ESCAPE
        case 'ArrowUp':
            return cursorKey('A', modifier)
        case 'ArrowDown':
            return cursorKey('B', modifier)
        case 'ArrowRight':
            return cursorKey('C', modifier)
        case 'ArrowLeft':
            return cursorKey('D', modifier)
        case 'Home':
            return cursorKey('H', modifier)
        case 'End':
            return cursorKey('F', modifier)
        case 'Insert':
            return editingKey(2, modifier)
        case 'Delete':
            return editingKey(3, modifier)
        case 'PageUp':
            return press.shiftKey ? null : editingKey(5, modifier)
        case 'PageDown':
            return press.shiftKey ? null : editingKey(6, modifier)
    }
    const functionKey = /^F([1-9]|1[0-2])$/.exec(press.key)
    if (functionKey) return functionKeySequence(Number(functionKey[1]), modifier)
    const control = controlCharacterOf(press)
    if (control === undefined || control === LITERAL_NEXT_CHARACTER) return null
    return String.fromCharCode(control)
}

/** An arrow, Home or End: `ESC [ A`, or `ESC [ 1 ; 5 A` with a modifier. */
function cursorKey(final: string, modifier: number): string {
    return modifier === 1 ? `${ESCAPE}[${final}` : `${ESCAPE}[1;${modifier}${final}`
}

/** A key of the editing pad or a function key from F5: `ESC [ 3 ~`, `ESC [ 3 ; 2 ~`. */
function editingKey(number: number, modifier: number): string {
    return modifier === 1 ? `${ESCAPE}[${number}~` : `${ESCAPE}[${number};${modifier}~`
}

/** xterm's numbers for F5 to F12, which skip 16 and 22 as the VT220's did. */
const FUNCTION_KEY_NUMBERS = [15, 17, 18, 19, 20, 21, 23, 24]

function functionKeySequence(number: number, modifier: number): string {
    if (number > 4) return editingKey(FUNCTION_KEY_NUMBERS[number - 5], modifier)
    const final = 'PQRS'[number - 1]
    return modifier === 1 ? `${ESCAPE}O${final}` : `${ESCAPE}[1;${modifier}${final}`
}

/**
 * How a Linux tty echoes what is typed in raw mode under `ECHO`. With `ECHOCTL` a control character
 * shows as `^` and the character 64 above it (`^C`, `^[` for Escape, `^?` for DEL), except a tab,
 * which is echoed as it is; without it, as on the guest's serial line as agetty leaves it, a control
 * character is echoed as itself, which shows nothing but what a terminal does with it (a carriage
 * return, a backspace). Enter is `\r`: with `ICRNL` the tty has made it a new line before echoing
 * it, and without it shows `^M`, or returns the cursor. Everything else is echoed as typed.
 */
export function echoOfTyped(text: string, crToNl: boolean, echoControl = true): string {
    let echo = ''
    for (const character of text) {
        if (character === '\r' && crToNl) echo += '\n'
        else echo += echoOfCharacter(character.codePointAt(0) ?? 0, character, echoControl)
    }
    return echo
}

/**
 * One control character as the tty echoes it: under `ECHOCTL` `^C` for `0x03`, without it the
 * character itself; others as they are.
 */
export function echoOfControl(code: number, echoControl = true): string {
    return echoOfCharacter(code, String.fromCharCode(code), echoControl)
}

function echoOfCharacter(code: number, character: string, echoControl: boolean): string {
    if (echoControl && ((code < 0x20 && character !== '\t') || code === DELETE)) {
        return `^${String.fromCharCode(code ^ 0x40)}`
    }
    return character
}
