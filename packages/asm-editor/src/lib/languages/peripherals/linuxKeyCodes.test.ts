import { describe, expect, it } from 'vite-plus/test'
import { LINUX_KEY, linuxKeyCode } from './linuxKeyCodes'

/** Every `KeyboardEvent.code` of a standard PC keyboard, ISO and Japanese keys included. */
const PC_KEYBOARD_CODES = [
    'Escape',
    ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
    'Backquote',
    ...Array.from({ length: 10 }, (_, i) => `Digit${i}`),
    'Minus',
    'Equal',
    'Backspace',
    'Tab',
    ...[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((letter) => `Key${letter}`),
    'BracketLeft',
    'BracketRight',
    'Backslash',
    'CapsLock',
    'Semicolon',
    'Quote',
    'Enter',
    'ShiftLeft',
    'IntlBackslash',
    'Comma',
    'Period',
    'Slash',
    'ShiftRight',
    'ControlLeft',
    'MetaLeft',
    'AltLeft',
    'Space',
    'AltRight',
    'MetaRight',
    'ContextMenu',
    'ControlRight',
    'PrintScreen',
    'ScrollLock',
    'Pause',
    'Insert',
    'Home',
    'PageUp',
    'Delete',
    'End',
    'PageDown',
    'ArrowUp',
    'ArrowLeft',
    'ArrowDown',
    'ArrowRight',
    'NumLock',
    'NumpadDivide',
    'NumpadMultiply',
    'NumpadSubtract',
    'NumpadAdd',
    'NumpadEnter',
    'NumpadDecimal',
    ...Array.from({ length: 10 }, (_, i) => `Numpad${i}`),
    'IntlRo',
    'IntlYen',
    'Convert',
    'NonConvert',
    'KanaMode',
    'Lang1',
    'Lang2',
    'NumpadComma',
    'NumpadEqual',
    'AudioVolumeMute',
    'AudioVolumeDown',
    'AudioVolumeUp',
    'MediaPlayPause',
    'MediaStop',
    'MediaTrackNext',
    'MediaTrackPrevious',
    'BrowserHome',
    'BrowserBack',
    'BrowserForward',
    'BrowserRefresh',
    'BrowserSearch',
    'BrowserFavorites',
    'LaunchMail',
    'LaunchApp1',
    'LaunchApp2',
    'Power',
    'Sleep',
    'WakeUp'
]

describe('linuxKeyCode', () => {
    it('numbers the main block as <linux/input-event-codes.h> does', () => {
        expect(linuxKeyCode('Escape')).toBe(1)
        expect(linuxKeyCode('Digit1')).toBe(2)
        expect(linuxKeyCode('Digit9')).toBe(10)
        expect(linuxKeyCode('Digit0')).toBe(11)
        expect(linuxKeyCode('Backspace')).toBe(14)
        expect(linuxKeyCode('KeyQ')).toBe(16)
        expect(linuxKeyCode('KeyP')).toBe(25)
        expect(linuxKeyCode('Enter')).toBe(28)
        expect(linuxKeyCode('KeyA')).toBe(30)
        expect(linuxKeyCode('KeyL')).toBe(38)
        expect(linuxKeyCode('Backquote')).toBe(41)
        expect(linuxKeyCode('KeyZ')).toBe(44)
        expect(linuxKeyCode('KeyM')).toBe(50)
        expect(linuxKeyCode('Slash')).toBe(53)
        expect(linuxKeyCode('Space')).toBe(57)
    })

    it('reads the physical key, so the same key is the same code on every layout', () => {
        //an AZERTY keyboard's "A" is where QWERTY has its Q
        expect(linuxKeyCode('KeyQ')).toBe(LINUX_KEY.Q)
        expect(linuxKeyCode('KeyW')).toBe(LINUX_KEY.W)
    })

    it('keeps left and right modifiers apart', () => {
        expect(linuxKeyCode('ShiftLeft')).toBe(42)
        expect(linuxKeyCode('ShiftRight')).toBe(54)
        expect(linuxKeyCode('ControlLeft')).toBe(29)
        expect(linuxKeyCode('ControlRight')).toBe(97)
        expect(linuxKeyCode('AltLeft')).toBe(56)
        expect(linuxKeyCode('AltRight')).toBe(100)
        expect(linuxKeyCode('MetaLeft')).toBe(125)
        expect(linuxKeyCode('MetaRight')).toBe(126)
    })

    it('gives the keypad its own codes, which Num Lock never changes', () => {
        expect(linuxKeyCode('Numpad7')).toBe(71)
        expect(linuxKeyCode('Numpad0')).toBe(82)
        expect(linuxKeyCode('NumpadDecimal')).toBe(83)
        expect(linuxKeyCode('NumpadEnter')).toBe(96)
        expect(linuxKeyCode('NumpadDivide')).toBe(98)
        expect(linuxKeyCode('NumpadMultiply')).toBe(55)
        //the keypad digit and the top-row digit are different keys
        expect(linuxKeyCode('Numpad1')).not.toBe(linuxKeyCode('Digit1'))
        expect(linuxKeyCode('NumpadEnter')).not.toBe(linuxKeyCode('Enter'))
    })

    it('numbers the function keys in their three runs', () => {
        expect(linuxKeyCode('F1')).toBe(59)
        expect(linuxKeyCode('F10')).toBe(68)
        expect(linuxKeyCode('F11')).toBe(87)
        expect(linuxKeyCode('F12')).toBe(88)
        expect(linuxKeyCode('F13')).toBe(183)
        expect(linuxKeyCode('F24')).toBe(194)
        expect(linuxKeyCode('F25')).toBe(undefined)
    })

    it('names the navigation and system keys as a PC keyboard driver does', () => {
        expect(linuxKeyCode('ArrowUp')).toBe(103)
        expect(linuxKeyCode('ArrowLeft')).toBe(105)
        expect(linuxKeyCode('ArrowRight')).toBe(106)
        expect(linuxKeyCode('ArrowDown')).toBe(108)
        expect(linuxKeyCode('PrintScreen')).toBe(99)
        expect(linuxKeyCode('Pause')).toBe(119)
        expect(linuxKeyCode('ContextMenu')).toBe(127)
        expect(linuxKeyCode('IntlBackslash')).toBe(86)
        //the AT keyboard's own codes for its multimedia keys
        expect(linuxKeyCode('LaunchApp1')).toBe(157)
        expect(linuxKeyCode('MediaSelect')).toBe(226)
    })

    it('reads the names earlier browsers gave the Meta and volume keys', () => {
        expect(linuxKeyCode('OSLeft')).toBe(linuxKeyCode('MetaLeft'))
        expect(linuxKeyCode('OSRight')).toBe(linuxKeyCode('MetaRight'))
        expect(linuxKeyCode('VolumeMute')).toBe(linuxKeyCode('AudioVolumeMute'))
    })

    it('has a distinct code for every key of a PC keyboard', () => {
        const codes = PC_KEYBOARD_CODES.map((code) => [code, linuxKeyCode(code)] as const)
        expect(codes.filter(([, value]) => value === undefined)).toEqual([])
        expect(new Set(codes.map(([, value]) => value)).size).toBe(codes.length)
        //all of them are keys, below the first button code
        for (const [, value] of codes) expect(value).toBeLessThan(0x100)
    })

    it('has no code for a key the browser could not name', () => {
        expect(linuxKeyCode('')).toBe(undefined)
        expect(linuxKeyCode('Unidentified')).toBe(undefined)
        expect(linuxKeyCode('Fn')).toBe(undefined)
    })
})
