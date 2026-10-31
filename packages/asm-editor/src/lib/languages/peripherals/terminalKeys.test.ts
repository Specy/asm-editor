import { describe, expect, it } from 'vite-plus/test'
import {
    controlCharacterOf,
    echoOfControl,
    echoOfTyped,
    rawKeySequence,
    type TerminalKeyPress
} from './terminalKeys'

/** A key as a `KeyboardEvent` names it, with no modifier unless given. */
function key(name: string, modifiers: Partial<TerminalKeyPress> = {}): TerminalKeyPress {
    return {
        key: name,
        code: '',
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        metaKey: false,
        ...modifiers
    }
}

const ctrl = (name: string, modifiers: Partial<TerminalKeyPress> = {}) =>
    key(name, { ctrlKey: true, ...modifiers })

describe("raw mode's keys", () => {
    it('sends Enter as a carriage return, Backspace as DEL, Tab and Escape as themselves', () => {
        expect(rawKeySequence(key('Enter'))).toBe('\r')
        expect(rawKeySequence(key('Backspace'))).toBe('\x7f')
        expect(rawKeySequence(ctrl('Backspace'))).toBe('\b')
        expect(rawKeySequence(key('Tab'))).toBe('\t')
        expect(rawKeySequence(key('Escape'))).toBe('\x1b')
    })

    it("sends the cursor and editing keys as xterm's escape sequences", () => {
        expect(rawKeySequence(key('ArrowUp'))).toBe('\x1b[A')
        expect(rawKeySequence(key('ArrowDown'))).toBe('\x1b[B')
        expect(rawKeySequence(key('ArrowRight'))).toBe('\x1b[C')
        expect(rawKeySequence(key('ArrowLeft'))).toBe('\x1b[D')
        expect(rawKeySequence(key('Home'))).toBe('\x1b[H')
        expect(rawKeySequence(key('End'))).toBe('\x1b[F')
        expect(rawKeySequence(key('Insert'))).toBe('\x1b[2~')
        expect(rawKeySequence(key('Delete'))).toBe('\x1b[3~')
        expect(rawKeySequence(key('PageUp'))).toBe('\x1b[5~')
        expect(rawKeySequence(key('PageDown'))).toBe('\x1b[6~')
    })

    it('sends the function keys as xterm does, skipping 16 and 22', () => {
        const sent = Array.from({ length: 12 }, (_, index) => rawKeySequence(key(`F${index + 1}`)))
        expect(sent).toEqual([
            '\x1bOP',
            '\x1bOQ',
            '\x1bOR',
            '\x1bOS',
            '\x1b[15~',
            '\x1b[17~',
            '\x1b[18~',
            '\x1b[19~',
            '\x1b[20~',
            '\x1b[21~',
            '\x1b[23~',
            '\x1b[24~'
        ])
    })

    it("adds xterm's modifier parameter for Shift, Alt and Ctrl", () => {
        expect(rawKeySequence(ctrl('ArrowUp'))).toBe('\x1b[1;5A')
        expect(rawKeySequence(key('ArrowLeft', { shiftKey: true }))).toBe('\x1b[1;2D')
        expect(rawKeySequence(key('End', { altKey: true }))).toBe('\x1b[1;3F')
        expect(rawKeySequence(key('Delete', { shiftKey: true }))).toBe('\x1b[3;2~')
        expect(rawKeySequence(ctrl('F1'))).toBe('\x1b[1;5P')
        expect(rawKeySequence(ctrl('F5', { shiftKey: true }))).toBe('\x1b[15;6~')
    })

    it('sends Ctrl and a letter as its control character, Ctrl+V aside', () => {
        expect(rawKeySequence(ctrl('a'))).toBe('\x01')
        expect(rawKeySequence(ctrl('c'))).toBe('\x03')
        expect(rawKeySequence(ctrl('d'))).toBe('\x04')
        expect(rawKeySequence(ctrl('Z'))).toBe('\x1a')
        expect(rawKeySequence(ctrl('s'))).toBe('\x13')
        expect(rawKeySequence(ctrl('q'))).toBe('\x11')
        //pasting, as in any field of the page
        expect(rawKeySequence(ctrl('v'))).toBeNull()
    })

    it('leaves text, Shift+Tab, scrolling and the page shortcuts to the page', () => {
        expect(rawKeySequence(key('a'))).toBeNull()
        expect(rawKeySequence(key(' '))).toBeNull()
        expect(rawKeySequence(key('Dead'))).toBeNull()
        expect(rawKeySequence(key('Shift', { shiftKey: true }))).toBeNull()
        expect(rawKeySequence(key('Tab', { shiftKey: true }))).toBeNull()
        expect(rawKeySequence(key('PageUp', { shiftKey: true }))).toBeNull()
        expect(rawKeySequence(ctrl('c', { shiftKey: true }))).toBeNull()
        expect(rawKeySequence(key('c', { metaKey: true }))).toBeNull()
        expect(rawKeySequence(key('ArrowUp', { metaKey: true }))).toBeNull()
        //AltGr is Ctrl and Alt on Windows, and types text
        expect(rawKeySequence(ctrl('@', { altKey: true }))).toBeNull()
    })
})

describe('control characters', () => {
    it('are the letter less 64, by the key typed or else by its position', () => {
        expect(controlCharacterOf(ctrl('c'))).toBe(0x03)
        expect(controlCharacterOf(ctrl('C'))).toBe(0x03)
        //a Cyrillic layout names the key by what it types; its position is C's
        expect(controlCharacterOf(ctrl('с', { code: 'KeyC' }))).toBe(0x03)
        //a French layout types `a` where QWERTY's Q is: the key typed decides
        expect(controlCharacterOf(ctrl('a', { code: 'KeyQ' }))).toBe(0x01)
        //punctuation at a letter's position is no letter
        expect(controlCharacterOf(ctrl(',', { code: 'KeyM' }))).toBeUndefined()
    })

    it('cover the punctuation a terminal maps, Ctrl+\\ being the quit character', () => {
        expect(controlCharacterOf(ctrl(' '))).toBe(0x00)
        expect(controlCharacterOf(ctrl('@'))).toBe(0x00)
        expect(controlCharacterOf(ctrl('['))).toBe(0x1b)
        expect(controlCharacterOf(ctrl('\\'))).toBe(0x1c)
        expect(controlCharacterOf(ctrl(']'))).toBe(0x1d)
        expect(controlCharacterOf(ctrl('^'))).toBe(0x1e)
        expect(controlCharacterOf(ctrl('_'))).toBe(0x1f)
        expect(controlCharacterOf(ctrl('/'))).toBe(0x1f)
        expect(controlCharacterOf(ctrl('?'))).toBe(0x7f)
        expect(controlCharacterOf(ctrl('1'))).toBeUndefined()
        expect(controlCharacterOf(key('c'))).toBeUndefined()
    })
})

describe('the echo of raw keys', () => {
    it('shows control characters as ^ and a letter, as ECHOCTL does, and a tab as it is', () => {
        expect(echoOfTyped('a\x03b', true)).toBe('a^Cb')
        expect(echoOfTyped('\x1b[A', true)).toBe('^[[A')
        expect(echoOfTyped('\x7f', true)).toBe('^?')
        expect(echoOfTyped('\x00\x1c', true)).toBe('^@^\\')
        expect(echoOfTyped('\n', true)).toBe('^J')
        expect(echoOfTyped('\t', true)).toBe('\t')
        expect(echoOfTyped('é😀', true)).toBe('é😀')
        expect(echoOfControl(0x03)).toBe('^C')
        expect(echoOfControl(0x1c)).toBe('^\\')
    })

    it('echoes Enter as a new line under ICRNL, and as ^M without it', () => {
        expect(echoOfTyped('ok\r', true)).toBe('ok\n')
        expect(echoOfTyped('ok\r', false)).toBe('ok^M')
    })
})
