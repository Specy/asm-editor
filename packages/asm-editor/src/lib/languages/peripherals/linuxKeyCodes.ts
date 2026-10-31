/**
 * Linux's key codes, the `KEY_*` values of `<linux/input-event-codes.h>` that an x86 program reads
 * from evdev ([x86 devices](../../../../../../docs/design/x86-devices.md), "The keyboard device"):
 * the **Reference environment**'s codes on x86, where the M68K and the Z80's Port map keep
 * EASy68K's (`keyCodes.ts`, and [ADR 0008](../../../../../../docs/adr/0008-poll-keyboard-and-mouse-input.md)'s
 * update of 2026-10-31).
 *
 * The browser's `KeyboardEvent.code` and a Linux key code both name a physical key, so the mapping
 * reads `code` alone and is exact whatever the layout: an AZERTY "A" is `KEY_Q`, as on a real evdev
 * device. Left and right Shift, Ctrl, Alt and Meta are separate keys, and the keypad keys keep their
 * codes whatever Num Lock does, which Linux leaves to the keymap.
 *
 * The codes are the ones the guest's "AT Translated Set 2 keyboard" gives each key QEMU sends it,
 * which are also those of a USB keyboard for every key the two have in common. The two differ on a
 * few multimedia keys, and there the AT keyboard's are used: the "My Computer" key the browser
 * calls `LaunchApp1` is `KEY_COMPUTER`, and its `MediaSelect` is `KEY_MEDIA`.
 *
 * Plain TypeScript with no DOM types, like `keyCodes.ts`, so it runs under node in tests.
 */

/** The `KEY_*` codes the table below gives, by their names in `<linux/input-event-codes.h>`. */
export const LINUX_KEY = {
    ESC: 1,
    /** `KEY_1` through `KEY_9` are 2 to 10 and `KEY_0` is 11, the order of the keyboard's top row. */
    KEY_1: 2,
    KEY_0: 11,
    MINUS: 12,
    EQUAL: 13,
    BACKSPACE: 14,
    TAB: 15,
    Q: 16,
    W: 17,
    E: 18,
    R: 19,
    T: 20,
    Y: 21,
    U: 22,
    I: 23,
    O: 24,
    P: 25,
    LEFTBRACE: 26,
    RIGHTBRACE: 27,
    ENTER: 28,
    LEFTCTRL: 29,
    A: 30,
    S: 31,
    D: 32,
    F: 33,
    G: 34,
    H: 35,
    J: 36,
    K: 37,
    L: 38,
    SEMICOLON: 39,
    APOSTROPHE: 40,
    GRAVE: 41,
    LEFTSHIFT: 42,
    BACKSLASH: 43,
    Z: 44,
    X: 45,
    C: 46,
    V: 47,
    B: 48,
    N: 49,
    M: 50,
    COMMA: 51,
    DOT: 52,
    SLASH: 53,
    RIGHTSHIFT: 54,
    KPASTERISK: 55,
    LEFTALT: 56,
    SPACE: 57,
    CAPSLOCK: 58,
    /** `KEY_F1` through `KEY_F10` are 59 to 68; F11 and F12 come later. */
    F1: 59,
    NUMLOCK: 69,
    SCROLLLOCK: 70,
    KP7: 71,
    KP8: 72,
    KP9: 73,
    KPMINUS: 74,
    KP4: 75,
    KP5: 76,
    KP6: 77,
    KPPLUS: 78,
    KP1: 79,
    KP2: 80,
    KP3: 81,
    KP0: 82,
    KPDOT: 83,
    ZENKAKUHANKAKU: 85,
    /** The key between left Shift and Z on an ISO keyboard. */
    KEY_102ND: 86,
    F11: 87,
    F12: 88,
    RO: 89,
    KATAKANA: 90,
    HIRAGANA: 91,
    HENKAN: 92,
    KATAKANAHIRAGANA: 93,
    MUHENKAN: 94,
    KPENTER: 96,
    RIGHTCTRL: 97,
    KPSLASH: 98,
    /** Print Screen, which Linux names after the SysRq it shares a key with. */
    SYSRQ: 99,
    RIGHTALT: 100,
    HOME: 102,
    UP: 103,
    PAGEUP: 104,
    LEFT: 105,
    RIGHT: 106,
    END: 107,
    DOWN: 108,
    PAGEDOWN: 109,
    INSERT: 110,
    DELETE: 111,
    MUTE: 113,
    VOLUMEDOWN: 114,
    VOLUMEUP: 115,
    POWER: 116,
    KPEQUAL: 117,
    PAUSE: 119,
    KPCOMMA: 121,
    HANGEUL: 122,
    HANJA: 123,
    YEN: 124,
    LEFTMETA: 125,
    RIGHTMETA: 126,
    /** The context menu key, which a PC keyboard's driver reports as Compose. */
    COMPOSE: 127,
    STOP: 128,
    AGAIN: 129,
    PROPS: 130,
    UNDO: 131,
    FRONT: 132,
    COPY: 133,
    OPEN: 134,
    PASTE: 135,
    FIND: 136,
    CUT: 137,
    HELP: 138,
    CALC: 140,
    SLEEP: 142,
    WAKEUP: 143,
    MAIL: 155,
    BOOKMARKS: 156,
    COMPUTER: 157,
    BACK: 158,
    FORWARD: 159,
    EJECTCD: 161,
    NEXTSONG: 163,
    PLAYPAUSE: 164,
    PREVIOUSSONG: 165,
    STOPCD: 166,
    HOMEPAGE: 172,
    REFRESH: 173,
    KPLEFTPAREN: 179,
    KPRIGHTPAREN: 180,
    /** `KEY_F13` through `KEY_F24` are 183 to 194. */
    F13: 183,
    SEARCH: 217,
    MEDIA: 226
} as const

/** The browser's name for each physical key whose code does not follow from a pattern. */
const LINUX_KEY_BY_EVENT_CODE: Readonly<Record<string, number>> = {
    Escape: LINUX_KEY.ESC,
    Minus: LINUX_KEY.MINUS,
    Equal: LINUX_KEY.EQUAL,
    Backspace: LINUX_KEY.BACKSPACE,
    Tab: LINUX_KEY.TAB,
    BracketLeft: LINUX_KEY.LEFTBRACE,
    BracketRight: LINUX_KEY.RIGHTBRACE,
    Enter: LINUX_KEY.ENTER,
    ControlLeft: LINUX_KEY.LEFTCTRL,
    Semicolon: LINUX_KEY.SEMICOLON,
    Quote: LINUX_KEY.APOSTROPHE,
    //also the Hankaku/Zenkaku key of a Japanese keyboard, which sits where this key does
    Backquote: LINUX_KEY.GRAVE,
    ShiftLeft: LINUX_KEY.LEFTSHIFT,
    Backslash: LINUX_KEY.BACKSLASH,
    Comma: LINUX_KEY.COMMA,
    Period: LINUX_KEY.DOT,
    Slash: LINUX_KEY.SLASH,
    ShiftRight: LINUX_KEY.RIGHTSHIFT,
    NumpadMultiply: LINUX_KEY.KPASTERISK,
    AltLeft: LINUX_KEY.LEFTALT,
    Space: LINUX_KEY.SPACE,
    CapsLock: LINUX_KEY.CAPSLOCK,
    NumLock: LINUX_KEY.NUMLOCK,
    ScrollLock: LINUX_KEY.SCROLLLOCK,
    Numpad7: LINUX_KEY.KP7,
    Numpad8: LINUX_KEY.KP8,
    Numpad9: LINUX_KEY.KP9,
    NumpadSubtract: LINUX_KEY.KPMINUS,
    Numpad4: LINUX_KEY.KP4,
    Numpad5: LINUX_KEY.KP5,
    Numpad6: LINUX_KEY.KP6,
    NumpadAdd: LINUX_KEY.KPPLUS,
    Numpad1: LINUX_KEY.KP1,
    Numpad2: LINUX_KEY.KP2,
    Numpad3: LINUX_KEY.KP3,
    Numpad0: LINUX_KEY.KP0,
    NumpadDecimal: LINUX_KEY.KPDOT,
    Lang5: LINUX_KEY.ZENKAKUHANKAKU,
    IntlBackslash: LINUX_KEY.KEY_102ND,
    IntlRo: LINUX_KEY.RO,
    Lang3: LINUX_KEY.KATAKANA,
    Lang4: LINUX_KEY.HIRAGANA,
    Convert: LINUX_KEY.HENKAN,
    KanaMode: LINUX_KEY.KATAKANAHIRAGANA,
    NonConvert: LINUX_KEY.MUHENKAN,
    NumpadEnter: LINUX_KEY.KPENTER,
    ControlRight: LINUX_KEY.RIGHTCTRL,
    NumpadDivide: LINUX_KEY.KPSLASH,
    PrintScreen: LINUX_KEY.SYSRQ,
    AltRight: LINUX_KEY.RIGHTALT,
    Home: LINUX_KEY.HOME,
    ArrowUp: LINUX_KEY.UP,
    PageUp: LINUX_KEY.PAGEUP,
    ArrowLeft: LINUX_KEY.LEFT,
    ArrowRight: LINUX_KEY.RIGHT,
    End: LINUX_KEY.END,
    ArrowDown: LINUX_KEY.DOWN,
    PageDown: LINUX_KEY.PAGEDOWN,
    Insert: LINUX_KEY.INSERT,
    Delete: LINUX_KEY.DELETE,
    AudioVolumeMute: LINUX_KEY.MUTE,
    AudioVolumeDown: LINUX_KEY.VOLUMEDOWN,
    AudioVolumeUp: LINUX_KEY.VOLUMEUP,
    Power: LINUX_KEY.POWER,
    NumpadEqual: LINUX_KEY.KPEQUAL,
    Pause: LINUX_KEY.PAUSE,
    NumpadComma: LINUX_KEY.KPCOMMA,
    Lang1: LINUX_KEY.HANGEUL,
    Lang2: LINUX_KEY.HANJA,
    IntlYen: LINUX_KEY.YEN,
    MetaLeft: LINUX_KEY.LEFTMETA,
    MetaRight: LINUX_KEY.RIGHTMETA,
    ContextMenu: LINUX_KEY.COMPOSE,
    BrowserStop: LINUX_KEY.STOP,
    Again: LINUX_KEY.AGAIN,
    Props: LINUX_KEY.PROPS,
    Undo: LINUX_KEY.UNDO,
    Select: LINUX_KEY.FRONT,
    Copy: LINUX_KEY.COPY,
    Open: LINUX_KEY.OPEN,
    Paste: LINUX_KEY.PASTE,
    Find: LINUX_KEY.FIND,
    Cut: LINUX_KEY.CUT,
    Help: LINUX_KEY.HELP,
    LaunchApp2: LINUX_KEY.CALC,
    Sleep: LINUX_KEY.SLEEP,
    WakeUp: LINUX_KEY.WAKEUP,
    LaunchMail: LINUX_KEY.MAIL,
    BrowserFavorites: LINUX_KEY.BOOKMARKS,
    LaunchApp1: LINUX_KEY.COMPUTER,
    BrowserBack: LINUX_KEY.BACK,
    BrowserForward: LINUX_KEY.FORWARD,
    Eject: LINUX_KEY.EJECTCD,
    MediaTrackNext: LINUX_KEY.NEXTSONG,
    MediaPlayPause: LINUX_KEY.PLAYPAUSE,
    MediaTrackPrevious: LINUX_KEY.PREVIOUSSONG,
    MediaStop: LINUX_KEY.STOPCD,
    BrowserHome: LINUX_KEY.HOMEPAGE,
    BrowserRefresh: LINUX_KEY.REFRESH,
    NumpadParenLeft: LINUX_KEY.KPLEFTPAREN,
    NumpadParenRight: LINUX_KEY.KPRIGHTPAREN,
    BrowserSearch: LINUX_KEY.SEARCH,
    MediaSelect: LINUX_KEY.MEDIA,
    //the names earlier Firefox and Chrome versions gave these keys
    OSLeft: LINUX_KEY.LEFTMETA,
    OSRight: LINUX_KEY.RIGHTMETA,
    VolumeMute: LINUX_KEY.MUTE,
    VolumeDown: LINUX_KEY.VOLUMEDOWN,
    VolumeUp: LINUX_KEY.VOLUMEUP,
    LaunchMediaPlayer: LINUX_KEY.MEDIA
}

/** The letter keys in the order Linux numbers them, row by row as on the keyboard. */
const LETTER_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'] as const
const LETTER_ROW_STARTS = [LINUX_KEY.Q, LINUX_KEY.A, LINUX_KEY.Z] as const

const LINUX_KEY_BY_LETTER: Readonly<Record<string, number>> = Object.fromEntries(
    LETTER_ROWS.flatMap((row, index) =>
        [...row].map((letter, column) => [letter, LETTER_ROW_STARTS[index] + column])
    )
)

const DIGIT_CODE = /^Digit([0-9])$/
const LETTER_CODE = /^Key([A-Z])$/
const FUNCTION_CODE = /^F([1-9]|1[0-9]|2[0-4])$/

/**
 * The `KEY_*` code of the physical key a `KeyboardEvent.code` names, or undefined for a key Linux
 * has no code for and for the empty and `Unidentified` codes a browser gives a key it cannot name.
 */
export function linuxKeyCode(code: string): number | undefined {
    const named = LINUX_KEY_BY_EVENT_CODE[code]
    if (named !== undefined) return named
    const digit = DIGIT_CODE.exec(code)
    if (digit) {
        const value = Number(digit[1])
        return value === 0 ? LINUX_KEY.KEY_0 : LINUX_KEY.KEY_1 + value - 1
    }
    const letter = LETTER_CODE.exec(code)
    if (letter) return LINUX_KEY_BY_LETTER[letter[1]]
    const functionKey = FUNCTION_CODE.exec(code)
    if (!functionKey) return undefined
    const index = Number(functionKey[1])
    if (index <= 10) return LINUX_KEY.F1 + index - 1
    if (index <= 12) return index === 11 ? LINUX_KEY.F11 : LINUX_KEY.F12
    return LINUX_KEY.F13 + index - 13
}
