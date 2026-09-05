/**
 * EASy68K's key codes, which every environment uses: the M68K adapter needs no mapping for task 19
 * and the Z80 key ports reuse this one documented table
 * ([ADR 0008](../../../../docs/adr/0008-poll-keyboard-and-mouse-input.md)). The codes come from
 * EASy68K's [key code page](https://acorn.huininga.nl/pub/projects/CiscOS/_emulators/EASy68Ksource/EASy68K_Help/keyCodes.htm),
 * which is the Windows virtual-key table EASy68K reads through `GetAsyncKeyState`: letters are the
 * ASCII code of their capital form, top-row digits their ASCII code, and everything else is named
 * below. `Tab`, the Windows keys and the numeric keypad's digits are not printed on that page, but
 * they are part of the same virtual-key table and are included so no key the browser reports is
 * left without a code.
 *
 * The two mapping functions turn a DOM `KeyboardEvent` into a code and into the character it typed.
 * They read `code` first, the layout-independent physical key, because a virtual-key code is
 * positional too: a program using WASD wants the same three keys left of the D key whatever the
 * layout produces. `key` only decides what Num Lock did and what character was typed.
 *
 * Plain TypeScript with no DOM dependency beyond the shape below, so it runs under node in tests.
 */

export type KeyCode = number

export const KEY_CODES = {
    BACKSPACE: 0x08,
    TAB: 0x09,
    /** Keypad 5 with Num Lock off, which Windows calls VK_CLEAR. */
    CLEAR: 0x0c,
    ENTER: 0x0d,
    SHIFT: 0x10,
    CTRL: 0x11,
    ALT: 0x12,
    PAUSE: 0x13,
    CAPS_LOCK: 0x14,
    ESCAPE: 0x1b,
    SPACE: 0x20,
    PAGE_UP: 0x21,
    PAGE_DOWN: 0x22,
    END: 0x23,
    HOME: 0x24,
    LEFT_ARROW: 0x25,
    UP_ARROW: 0x26,
    RIGHT_ARROW: 0x27,
    DOWN_ARROW: 0x28,
    INSERT: 0x2d,
    DELETE: 0x2e,
    /** Digits are their ASCII code: `DIGIT_0` through `DIGIT_0 + 9`. */
    DIGIT_0: 0x30,
    /** Letters are the ASCII code of the capital: `LETTER_A` through `LETTER_A + 25`. */
    LETTER_A: 0x41,
    LEFT_META: 0x5b,
    RIGHT_META: 0x5c,
    CONTEXT_MENU: 0x5d,
    /** Keypad digits with Num Lock on: `KEYPAD_0` through `KEYPAD_0 + 9`. */
    KEYPAD_0: 0x60,
    KEYPAD_MULTIPLY: 0x6a,
    KEYPAD_ADD: 0x6b,
    KEYPAD_SUBTRACT: 0x6d,
    KEYPAD_DECIMAL: 0x6e,
    KEYPAD_DIVIDE: 0x6f,
    /** Function keys are contiguous: `F1` through `F1 + 11` for F12. */
    F1: 0x70,
    NUM_LOCK: 0x90,
    SCROLL_LOCK: 0x91,
    SEMICOLON: 0xba,
    EQUALS: 0xbb,
    COMMA: 0xbc,
    MINUS: 0xbd,
    PERIOD: 0xbe,
    SLASH: 0xbf,
    BACKQUOTE: 0xc0,
    OPEN_BRACKET: 0xdb,
    BACKSLASH: 0xdc,
    CLOSE_BRACKET: 0xdd,
    QUOTE: 0xde
} as const

/** The code of a letter key, from either case: `letterKeyCode('w')` is the same key as `'W'`. */
export function letterKeyCode(letter: string): KeyCode {
    return KEY_CODES.LETTER_A + (letter.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0))
}

/** The code of a top-row digit key, 0 to 9. */
export function digitKeyCode(digit: number): KeyCode {
    return KEY_CODES.DIGIT_0 + digit
}

/** The code of a function key, 1 to 12. */
export function functionKeyCode(index: number): KeyCode {
    return KEY_CODES.F1 + index - 1
}

/**
 * The part of a DOM `KeyboardEvent` the peripherals read. Declared structurally so tests and the
 * Z80's own input paths can hand over a plain object, and so this module needs no DOM types.
 */
export type KeyboardEventLike = {
    /** `KeyboardEvent.code`: the physical key, layout independent, like a virtual-key code. */
    code: string
    /** `KeyboardEvent.key`: what the key produced, after Shift, the layout and Num Lock. */
    key: string
    /** `KeyboardEvent.repeat`: the key is still down and the host is auto-repeating it. */
    repeat?: boolean
    ctrlKey?: boolean
    altKey?: boolean
    metaKey?: boolean
    shiftKey?: boolean
}

/** Physical keys whose code does not follow from a pattern. Numpad keys are handled separately. */
const KEY_CODE_BY_EVENT_CODE: Record<string, KeyCode> = {
    Backspace: KEY_CODES.BACKSPACE,
    Tab: KEY_CODES.TAB,
    Enter: KEY_CODES.ENTER,
    ShiftLeft: KEY_CODES.SHIFT,
    ShiftRight: KEY_CODES.SHIFT,
    ControlLeft: KEY_CODES.CTRL,
    ControlRight: KEY_CODES.CTRL,
    AltLeft: KEY_CODES.ALT,
    AltRight: KEY_CODES.ALT,
    Pause: KEY_CODES.PAUSE,
    CapsLock: KEY_CODES.CAPS_LOCK,
    Escape: KEY_CODES.ESCAPE,
    Space: KEY_CODES.SPACE,
    PageUp: KEY_CODES.PAGE_UP,
    PageDown: KEY_CODES.PAGE_DOWN,
    End: KEY_CODES.END,
    Home: KEY_CODES.HOME,
    ArrowLeft: KEY_CODES.LEFT_ARROW,
    ArrowUp: KEY_CODES.UP_ARROW,
    ArrowRight: KEY_CODES.RIGHT_ARROW,
    ArrowDown: KEY_CODES.DOWN_ARROW,
    Insert: KEY_CODES.INSERT,
    Delete: KEY_CODES.DELETE,
    MetaLeft: KEY_CODES.LEFT_META,
    MetaRight: KEY_CODES.RIGHT_META,
    ContextMenu: KEY_CODES.CONTEXT_MENU,
    NumLock: KEY_CODES.NUM_LOCK,
    ScrollLock: KEY_CODES.SCROLL_LOCK,
    Semicolon: KEY_CODES.SEMICOLON,
    Equal: KEY_CODES.EQUALS,
    Comma: KEY_CODES.COMMA,
    Minus: KEY_CODES.MINUS,
    Period: KEY_CODES.PERIOD,
    Slash: KEY_CODES.SLASH,
    Backquote: KEY_CODES.BACKQUOTE,
    BracketLeft: KEY_CODES.OPEN_BRACKET,
    Backslash: KEY_CODES.BACKSLASH,
    BracketRight: KEY_CODES.CLOSE_BRACKET,
    Quote: KEY_CODES.QUOTE
}

/** Keypad keys that Num Lock does not change. */
const KEY_CODE_BY_NUMPAD_CODE: Record<string, KeyCode> = {
    NumpadEnter: KEY_CODES.ENTER,
    NumpadMultiply: KEY_CODES.KEYPAD_MULTIPLY,
    NumpadAdd: KEY_CODES.KEYPAD_ADD,
    NumpadSubtract: KEY_CODES.KEYPAD_SUBTRACT,
    NumpadDivide: KEY_CODES.KEYPAD_DIVIDE
}

/** Named `key` values, the fallback for a layout whose `code` this table does not know. */
const KEY_CODE_BY_KEY_NAME: Record<string, KeyCode> = {
    Backspace: KEY_CODES.BACKSPACE,
    Tab: KEY_CODES.TAB,
    Clear: KEY_CODES.CLEAR,
    Enter: KEY_CODES.ENTER,
    Shift: KEY_CODES.SHIFT,
    Control: KEY_CODES.CTRL,
    Alt: KEY_CODES.ALT,
    Pause: KEY_CODES.PAUSE,
    CapsLock: KEY_CODES.CAPS_LOCK,
    Escape: KEY_CODES.ESCAPE,
    PageUp: KEY_CODES.PAGE_UP,
    PageDown: KEY_CODES.PAGE_DOWN,
    End: KEY_CODES.END,
    Home: KEY_CODES.HOME,
    ArrowLeft: KEY_CODES.LEFT_ARROW,
    ArrowUp: KEY_CODES.UP_ARROW,
    ArrowRight: KEY_CODES.RIGHT_ARROW,
    ArrowDown: KEY_CODES.DOWN_ARROW,
    Insert: KEY_CODES.INSERT,
    Delete: KEY_CODES.DELETE,
    Meta: KEY_CODES.LEFT_META,
    ContextMenu: KEY_CODES.CONTEXT_MENU,
    NumLock: KEY_CODES.NUM_LOCK,
    ScrollLock: KEY_CODES.SCROLL_LOCK
}

/** The characters keys type that `key` reports as a name instead of as text. */
const CHARACTER_BY_KEY_NAME: Record<string, string> = {
    Enter: '\n',
    Tab: '\t',
    Backspace: '\b',
    Escape: '\x1b'
}

const FUNCTION_KEY_NAME = /^F([1-9]|1[0-2])$/
const DIGIT = /^[0-9]$/
const LETTER = /^[a-z]$/i

/** The EASy68K code of the key the event names, or undefined when it has none. */
export function keyCodeFromEvent(event: KeyboardEventLike): KeyCode | undefined {
    if (event.code.startsWith('Numpad')) return numpadKeyCode(event)
    const physical = KEY_CODE_BY_EVENT_CODE[event.code]
    if (physical !== undefined) return physical
    if (event.code.startsWith('Key')) return letterKeyCode(event.code.slice(3))
    if (event.code.startsWith('Digit')) return digitKeyCode(Number(event.code.slice(5)))
    return keyCodeFromKeyName(event.code) ?? keyCodeFromKeyName(event.key)
}

/**
 * The keypad reports one `code` per key whatever Num Lock does, and only `key` tells the two
 * meanings apart: Windows has a virtual-key code for each, which is why the page above lists both
 * `Insert/Keypad 0` and the keypad digits.
 */
function numpadKeyCode(event: KeyboardEventLike): KeyCode | undefined {
    const unshifted = KEY_CODE_BY_NUMPAD_CODE[event.code]
    if (unshifted !== undefined) return unshifted
    if (DIGIT.test(event.key)) return KEY_CODES.KEYPAD_0 + Number(event.key)
    //a comma is the decimal separator of the keypad on several layouts
    if (event.key === '.' || event.key === ',') return KEY_CODES.KEYPAD_DECIMAL
    return keyCodeFromKeyName(event.key)
}

function keyCodeFromKeyName(name: string): KeyCode | undefined {
    const named = KEY_CODE_BY_KEY_NAME[name]
    if (named !== undefined) return named
    if (name === ' ') return KEY_CODES.SPACE
    if (DIGIT.test(name)) return digitKeyCode(Number(name))
    if (LETTER.test(name)) return letterKeyCode(name)
    const functionKey = FUNCTION_KEY_NAME.exec(name)
    return functionKey ? functionKeyCode(Number(functionKey[1])) : undefined
}

/** The character the event typed, for the Keyboard's typed queue, or undefined when it typed none. */
export function typedCharacterFromEvent(event: KeyboardEventLike): string | undefined {
    //Ctrl and Meta combinations are host shortcuts rather than text, the same ones the upstream
    //TRS-80 keyboard leaves to the browser
    if (event.ctrlKey || event.metaKey) return undefined
    const named = CHARACTER_BY_KEY_NAME[event.key]
    if (named !== undefined) return named
    //`key` is the character itself for every printable key, already shifted and localized; anything
    //longer than one code point is a name like "ArrowLeft"
    return [...event.key].length === 1 ? event.key : undefined
}
