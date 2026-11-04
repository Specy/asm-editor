/**
 * The **Input controller**'s registers, the one model of them that the device, its Documentation
 * chapter, the coding agent's prompt and `<sim.h>` all read
 * ([the design record](../../../../../docs/design/input-controller.md), decisions 7, 8, 11 and 12).
 * Offsets are from the block's base, and every register is a little-endian word, as MARS and RARS
 * are little-endian.
 *
 * Plain data with no imports, so `scripts/sim-header` loads it under node.
 */

/** Where the block starts on MIPS and RISC-V: right after the Synth, 0xFFFF0100 to 0xFFFF02FF. */
export const INPUT_BASE = 0xffff0300

/** The block spans 64 bytes from its base. */
export const INPUT_BLOCK_SIZE = 0x40

/** The ID register's value: "INP" and version 1. A later change to the layout takes a new version. */
export const INPUT_ID_VALUE = 0x494e5001

export const INPUT_ID = 0x00
export const INPUT_CONTROL = 0x04
export const INPUT_STATUS = 0x08
export const INPUT_EVENT = 0x0c
export const INPUT_POINTER = 0x10
/** 256 bits, one per HID usage: key `u` is bit `u & 7` of byte `INPUT_KEYS + (u >> 3)`. */
export const INPUT_KEYS = 0x20
export const INPUT_KEYS_SIZE = 0x20

/**
 * Bit 1 of Control, reserved for an interrupt-enable bit: setting it stops the program, as this
 * controller raises no interrupt yet, though the keyboard receiver and the timers do.
 */
export const INPUT_INTERRUPT_ENABLE_BIT = 0x2

/** How many events the queue holds, 256 bytes of FIFO. */
export const INPUT_QUEUE_DEPTH = 64

/** Status holds the count in bits 6–0: put-backs after an Undo can take it past the depth. */
export const INPUT_STATUS_MAX = 127

export type InputRegister = {
    /** For `<sim.h>` and the Documentation: `SIM_INPUT_<name>`. */
    readonly name: string
    readonly offset: number
    readonly access: 'read' | 'write' | 'pop'
    readonly description: string
}

export const INPUT_REGISTERS = [
    {
        name: 'ID',
        offset: INPUT_ID,
        access: 'read',
        description:
            '`0x494E5001`, "INP" and version 1, while the Input controller is there; 0 in MARS and RARS, which do not have it'
    },
    {
        name: 'CONTROL',
        offset: INPUT_CONTROL,
        access: 'write',
        description:
            'Reads 0. Bit 1 is reserved for an interrupt-enable bit: storing a value with it set stops the program, as the Input controller raises no interrupt; poll Status instead. Other bits are ignored'
    },
    {
        name: 'STATUS',
        offset: INPUT_STATUS,
        access: 'read',
        description:
            'Bits 6–0: how many events wait in the queue, 0 to 127. Reading it takes nothing'
    },
    {
        name: 'EVENT',
        offset: INPUT_EVENT,
        access: 'pop',
        description:
            'The oldest event in the queue, which reading takes out; 0 when the queue is empty. Read it with `lw`'
    },
    {
        name: 'POINTER',
        offset: INPUT_POINTER,
        access: 'read',
        description:
            'Where the pointer is and which buttons are held: y in bits 30–21, x in bits 20–11, buttons in bits 2–0'
    },
    {
        name: 'KEYS',
        offset: INPUT_KEYS,
        access: 'read',
        description:
            'The keys held now, 256 bits, one per HID usage: key `u` is bit `u & 7` of the byte at `KEYS + (u >> 3)`'
    }
] as const satisfies readonly InputRegister[]

/** Where the fields of an event word and of the pointer word sit. Bit 31 is always 0. */
export const INPUT_Y_SHIFT = 21
export const INPUT_X_SHIFT = 11
export const INPUT_KIND_SHIFT = 8
export const INPUT_COORDINATE_MASK = 0x3ff
export const INPUT_KIND_MASK = 0x7
export const INPUT_CODE_MASK = 0xff
export const INPUT_BUTTONS_MASK = 0x7

/** An event word's kind, bits 10–8, in order: 0 is none, which an empty queue reads. */
export const INPUT_KINDS = [
    { name: 'NONE', value: 0, description: 'No event: the queue was empty' },
    { name: 'KEY_DOWN', value: 1, description: 'A key went down; the code is its HID usage' },
    { name: 'KEY_UP', value: 2, description: 'A key came up; the code is its HID usage' },
    {
        name: 'KEY_REPEAT',
        value: 3,
        description: 'A held key repeats, as it does when typing; the code is its HID usage'
    },
    {
        name: 'BUTTON_DOWN',
        value: 4,
        description: 'A mouse button went down; the code is 1 left, 2 right or 3 middle'
    },
    {
        name: 'BUTTON_UP',
        value: 5,
        description: 'A mouse button came up; the code is 1 left, 2 right or 3 middle'
    },
    {
        name: 'WHEEL',
        value: 6,
        description:
            'The wheel turned; the code is a signed count of notches, positive away from the user'
    },
    {
        name: 'DROPPED',
        value: 7,
        description: 'The queue was full and events were lost here: read the state registers again'
    }
] as const

export const INPUT_KIND_NONE = 0
export const INPUT_KIND_KEY_DOWN = 1
export const INPUT_KIND_KEY_UP = 2
export const INPUT_KIND_KEY_REPEAT = 3
export const INPUT_KIND_BUTTON_DOWN = 4
export const INPUT_KIND_BUTTON_UP = 5
export const INPUT_KIND_WHEEL = 6
export const INPUT_KIND_DROPPED = 7

/**
 * The mouse buttons, in the two encodings: `code` is a button event's code, the Button page's
 * numbering, and `held` the pointer register's bit.
 */
export const INPUT_BUTTONS = [
    { name: 'LEFT', button: 'left', code: 1, held: 0x1 },
    { name: 'RIGHT', button: 'right', code: 2, held: 0x2 },
    { name: 'MIDDLE', button: 'middle', code: 3, held: 0x4 }
] as const

/** The most notches one wheel record holds, either way, when bursts are merged into it. */
export const INPUT_WHEEL_MAX = 127

/** One physical key: its browser `KeyboardEvent.code` and its USB HID usage on page 0x07. */
export type InputKey = {
    readonly code: string
    readonly usage: number
    /** An older name of a key that also has `code`'s current one: in the mapping, not the names. */
    readonly alias?: true
}

/**
 * Every key that has a usage on the HID Keyboard/Keypad page (0x07), by its `KeyboardEvent.code`,
 * whose names follow HID's. One list gives the editor's mapping, the header's names and the
 * Documentation's table. A key that is not here sends nothing: media and consumer keys, Fn,
 * `Unidentified`. The ISO key at 0x32 has no name of its own in browsers, so it is never reported.
 */
export const INPUT_KEY_TABLE: readonly InputKey[] = [
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
        .split('')
        .map((letter, index) => ({ code: `Key${letter}`, usage: 0x04 + index })),
    ...'1234567890'
        .split('')
        .map((digit, index) => ({ code: `Digit${digit}`, usage: 0x1e + index })),
    { code: 'Enter', usage: 0x28 },
    { code: 'Escape', usage: 0x29 },
    { code: 'Backspace', usage: 0x2a },
    { code: 'Tab', usage: 0x2b },
    { code: 'Space', usage: 0x2c },
    { code: 'Minus', usage: 0x2d },
    { code: 'Equal', usage: 0x2e },
    { code: 'BracketLeft', usage: 0x2f },
    { code: 'BracketRight', usage: 0x30 },
    { code: 'Backslash', usage: 0x31 },
    { code: 'Semicolon', usage: 0x33 },
    { code: 'Quote', usage: 0x34 },
    { code: 'Backquote', usage: 0x35 },
    { code: 'Comma', usage: 0x36 },
    { code: 'Period', usage: 0x37 },
    { code: 'Slash', usage: 0x38 },
    { code: 'CapsLock', usage: 0x39 },
    ...Array.from({ length: 12 }, (_, index) => ({ code: `F${index + 1}`, usage: 0x3a + index })),
    { code: 'PrintScreen', usage: 0x46 },
    { code: 'ScrollLock', usage: 0x47 },
    { code: 'Pause', usage: 0x48 },
    { code: 'Insert', usage: 0x49 },
    { code: 'Home', usage: 0x4a },
    { code: 'PageUp', usage: 0x4b },
    { code: 'Delete', usage: 0x4c },
    { code: 'End', usage: 0x4d },
    { code: 'PageDown', usage: 0x4e },
    { code: 'ArrowRight', usage: 0x4f },
    { code: 'ArrowLeft', usage: 0x50 },
    { code: 'ArrowDown', usage: 0x51 },
    { code: 'ArrowUp', usage: 0x52 },
    { code: 'NumLock', usage: 0x53 },
    { code: 'NumpadDivide', usage: 0x54 },
    { code: 'NumpadMultiply', usage: 0x55 },
    { code: 'NumpadSubtract', usage: 0x56 },
    { code: 'NumpadAdd', usage: 0x57 },
    { code: 'NumpadEnter', usage: 0x58 },
    ...'123456789'
        .split('')
        .map((digit, index) => ({ code: `Numpad${digit}`, usage: 0x59 + index })),
    { code: 'Numpad0', usage: 0x62 },
    { code: 'NumpadDecimal', usage: 0x63 },
    { code: 'IntlBackslash', usage: 0x64 },
    { code: 'ContextMenu', usage: 0x65 },
    { code: 'NumpadEqual', usage: 0x67 },
    ...Array.from({ length: 12 }, (_, index) => ({ code: `F${index + 13}`, usage: 0x68 + index })),
    { code: 'Help', usage: 0x75 },
    { code: 'NumpadComma', usage: 0x85 },
    { code: 'IntlRo', usage: 0x87 },
    { code: 'KanaMode', usage: 0x88 },
    { code: 'IntlYen', usage: 0x89 },
    { code: 'Convert', usage: 0x8a },
    { code: 'NonConvert', usage: 0x8b },
    { code: 'Lang1', usage: 0x90 },
    { code: 'Lang2', usage: 0x91 },
    { code: 'Lang3', usage: 0x92 },
    { code: 'Lang4', usage: 0x93 },
    { code: 'Lang5', usage: 0x94 },
    { code: 'NumpadParenLeft', usage: 0xb6 },
    { code: 'NumpadParenRight', usage: 0xb7 },
    { code: 'NumpadBackspace', usage: 0xbb },
    { code: 'ControlLeft', usage: 0xe0 },
    { code: 'ShiftLeft', usage: 0xe1 },
    { code: 'AltLeft', usage: 0xe2 },
    { code: 'MetaLeft', usage: 0xe3 },
    { code: 'ControlRight', usage: 0xe4 },
    { code: 'ShiftRight', usage: 0xe5 },
    { code: 'AltRight', usage: 0xe6 },
    { code: 'MetaRight', usage: 0xe7 },
    //Firefox's names for the Meta keys before version 118
    { code: 'OSLeft', usage: 0xe3, alias: true },
    { code: 'OSRight', usage: 0xe7, alias: true }
]

/** The HID usage of a `KeyboardEvent.code`, or undefined for a key that has none. */
export const INPUT_USAGE_BY_CODE: Readonly<Record<string, number>> = Object.fromEntries(
    INPUT_KEY_TABLE.map((key) => [key.code, key.usage])
)

/**
 * A key's name for `<sim.h>` and the Documentation, its `code` in screaming snake case after
 * `SIM_KEY_`: `KeyA` is `A`, `ArrowLeft` `ARROW_LEFT`, `Digit1` `DIGIT_1`, `F12` `F12`.
 */
export function inputKeyName(code: string): string {
    if (/^Key[A-Z]$/.test(code)) return code.slice(3)
    return code
        .replace(/([a-z])([A-Z0-9])/g, '$1_$2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
        .toUpperCase()
}

/** What `<sim.h>` is generated from, for `scripts/sim-header` and the drift test alike. */
export function inputHeaderData() {
    return {
        base: INPUT_BASE,
        depth: INPUT_QUEUE_DEPTH,
        offsets: Object.fromEntries(
            INPUT_REGISTERS.map((register) => [register.name, register.offset])
        ),
        shifts: { y: INPUT_Y_SHIFT, x: INPUT_X_SHIFT, kind: INPUT_KIND_SHIFT },
        masks: {
            coordinate: INPUT_COORDINATE_MASK,
            kind: INPUT_KIND_MASK,
            code: INPUT_CODE_MASK,
            buttons: INPUT_BUTTONS_MASK
        },
        kinds: INPUT_KINDS,
        buttons: INPUT_BUTTONS,
        keys: INPUT_KEY_TABLE.filter((key) => !key.alias).map((key) => ({
            name: inputKeyName(key.code),
            usage: key.usage
        }))
    }
}
