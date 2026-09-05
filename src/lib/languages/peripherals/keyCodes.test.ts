import { describe, expect, it } from 'vitest'
import {
    digitKeyCode,
    functionKeyCode,
    KEY_CODES,
    keyCodeFromEvent,
    letterKeyCode,
    typedCharacterFromEvent,
    type KeyboardEventLike
} from './keyCodes'

function event(code: string, key: string, extra: Partial<KeyboardEventLike> = {}) {
    return { code, key, ...extra }
}

describe('the EASy68K table', () => {
    it('gives letters and digits their ASCII code, in the capital form', () => {
        expect(letterKeyCode('a')).toBe(0x41)
        expect(letterKeyCode('W')).toBe(0x57)
        expect(letterKeyCode('z')).toBe(0x5a)
        expect(digitKeyCode(0)).toBe(0x30)
        expect(digitKeyCode(9)).toBe(0x39)
    })

    it('numbers the function keys from F1', () => {
        expect(functionKeyCode(1)).toBe(0x70)
        expect(functionKeyCode(12)).toBe(0x7b)
    })

    it('matches the codes printed on the EASy68K key code page', () => {
        expect(KEY_CODES.BACKSPACE).toBe(0x08)
        expect(KEY_CODES.CLEAR).toBe(0x0c)
        expect(KEY_CODES.ENTER).toBe(0x0d)
        expect(KEY_CODES.SHIFT).toBe(0x10)
        expect(KEY_CODES.CTRL).toBe(0x11)
        expect(KEY_CODES.ALT).toBe(0x12)
        expect(KEY_CODES.ESCAPE).toBe(0x1b)
        expect(KEY_CODES.SPACE).toBe(0x20)
        expect(KEY_CODES.LEFT_ARROW).toBe(0x25)
        expect(KEY_CODES.DOWN_ARROW).toBe(0x28)
        expect(KEY_CODES.INSERT).toBe(0x2d)
        expect(KEY_CODES.DELETE).toBe(0x2e)
        expect(KEY_CODES.KEYPAD_MULTIPLY).toBe(0x6a)
        expect(KEY_CODES.KEYPAD_DIVIDE).toBe(0x6f)
        expect(KEY_CODES.NUM_LOCK).toBe(0x90)
        expect(KEY_CODES.SEMICOLON).toBe(0xba)
        expect(KEY_CODES.QUOTE).toBe(0xde)
    })
})

describe('mapping a DOM event to a key code', () => {
    it('reads the physical key, so a program keeps the same keys on another layout', () => {
        //the AZERTY key where QWERTY has Q reports code KeyQ and key "a"
        expect(keyCodeFromEvent(event('KeyQ', 'a'))).toBe(letterKeyCode('q'))
        expect(keyCodeFromEvent(event('KeyW', 'W', { shiftKey: true }))).toBe(letterKeyCode('w'))
        expect(keyCodeFromEvent(event('Digit3', '#', { shiftKey: true }))).toBe(digitKeyCode(3))
    })

    it('maps the named keys', () => {
        expect(keyCodeFromEvent(event('ArrowUp', 'ArrowUp'))).toBe(KEY_CODES.UP_ARROW)
        expect(keyCodeFromEvent(event('Space', ' '))).toBe(KEY_CODES.SPACE)
        expect(keyCodeFromEvent(event('Enter', 'Enter'))).toBe(KEY_CODES.ENTER)
        expect(keyCodeFromEvent(event('Escape', 'Escape'))).toBe(KEY_CODES.ESCAPE)
        expect(keyCodeFromEvent(event('F5', 'F5'))).toBe(functionKeyCode(5))
        expect(keyCodeFromEvent(event('Slash', '/'))).toBe(KEY_CODES.SLASH)
        expect(keyCodeFromEvent(event('Backquote', '`'))).toBe(KEY_CODES.BACKQUOTE)
    })

    it('gives both Shift keys the one Shift code, as a virtual-key code has', () => {
        expect(keyCodeFromEvent(event('ShiftLeft', 'Shift'))).toBe(KEY_CODES.SHIFT)
        expect(keyCodeFromEvent(event('ShiftRight', 'Shift'))).toBe(KEY_CODES.SHIFT)
        expect(keyCodeFromEvent(event('ControlRight', 'Control'))).toBe(KEY_CODES.CTRL)
    })

    it('tells the two meanings of a keypad key apart by what Num Lock produced', () => {
        expect(keyCodeFromEvent(event('Numpad4', '4'))).toBe(KEY_CODES.KEYPAD_0 + 4)
        expect(keyCodeFromEvent(event('Numpad4', 'ArrowLeft'))).toBe(KEY_CODES.LEFT_ARROW)
        expect(keyCodeFromEvent(event('Numpad5', '5'))).toBe(KEY_CODES.KEYPAD_0 + 5)
        expect(keyCodeFromEvent(event('Numpad5', 'Clear'))).toBe(KEY_CODES.CLEAR)
        expect(keyCodeFromEvent(event('NumpadDecimal', '.'))).toBe(KEY_CODES.KEYPAD_DECIMAL)
        expect(keyCodeFromEvent(event('NumpadDecimal', 'Delete'))).toBe(KEY_CODES.DELETE)
        expect(keyCodeFromEvent(event('NumpadEnter', 'Enter'))).toBe(KEY_CODES.ENTER)
        expect(keyCodeFromEvent(event('NumpadAdd', '+'))).toBe(KEY_CODES.KEYPAD_ADD)
    })

    it('falls back to the key when the physical code is unknown', () => {
        expect(keyCodeFromEvent(event('Unidentified', 'ArrowRight'))).toBe(KEY_CODES.RIGHT_ARROW)
        expect(keyCodeFromEvent(event('', 'k'))).toBe(letterKeyCode('k'))
        expect(keyCodeFromEvent(event('Lang1', 'Process'))).toBeUndefined()
    })
})

describe('the character an event types', () => {
    it('types what the key produced, after Shift and the layout', () => {
        expect(typedCharacterFromEvent(event('KeyA', 'a'))).toBe('a')
        expect(typedCharacterFromEvent(event('KeyA', 'A', { shiftKey: true }))).toBe('A')
        expect(typedCharacterFromEvent(event('KeyQ', 'a'))).toBe('a')
        expect(typedCharacterFromEvent(event('Space', ' '))).toBe(' ')
    })

    it('types the control characters a terminal expects', () => {
        expect(typedCharacterFromEvent(event('Enter', 'Enter'))).toBe('\n')
        expect(typedCharacterFromEvent(event('NumpadEnter', 'Enter'))).toBe('\n')
        expect(typedCharacterFromEvent(event('Tab', 'Tab'))).toBe('\t')
        expect(typedCharacterFromEvent(event('Backspace', 'Backspace'))).toBe('\b')
        expect(typedCharacterFromEvent(event('Escape', 'Escape'))).toBe('\x1b')
    })

    it('types nothing for a key that produced no text', () => {
        expect(typedCharacterFromEvent(event('ArrowLeft', 'ArrowLeft'))).toBeUndefined()
        expect(typedCharacterFromEvent(event('ShiftLeft', 'Shift'))).toBeUndefined()
        expect(typedCharacterFromEvent(event('F1', 'F1'))).toBeUndefined()
    })

    it('leaves Ctrl and Meta combinations to the host', () => {
        expect(typedCharacterFromEvent(event('KeyC', 'c', { ctrlKey: true }))).toBeUndefined()
        expect(typedCharacterFromEvent(event('KeyS', 's', { metaKey: true }))).toBeUndefined()
        //Alt is an ordinary modifier for a program, and AltGr types on several layouts
        expect(typedCharacterFromEvent(event('Digit5', '[', { altKey: true }))).toBe('[')
    })
})
