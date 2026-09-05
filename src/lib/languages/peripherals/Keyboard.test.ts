import { describe, expect, it } from 'vitest'
import { DEFAULT_KEY_HOLD_INTERVAL_MS, Keyboard } from './Keyboard'
import { KEY_CODES, letterKeyCode } from './keyCodes'

const A = letterKeyCode('a')
const B = letterKeyCode('b')
const SPACE = KEY_CODES.SPACE

/** A keyboard whose time the test drives, like the run loop drives the program's. */
function makeKeyboard(holdIntervalMs = DEFAULT_KEY_HOLD_INTERVAL_MS) {
    const clock = { time: 0 }
    const keyboard = new Keyboard({ now: () => clock.time, holdIntervalMs })
    return { keyboard, clock }
}

function keyDown(key: string, code = `Key${key.toUpperCase()}`) {
    return { code, key }
}

describe('the typed-character queue', () => {
    it('never drops a keystroke', () => {
        const { keyboard } = makeKeyboard()
        for (const letter of 'hello') keyboard.keyDown(keyDown(letter))
        expect(keyboard.typedCount).toBe(5)
        let read = ''
        while (keyboard.hasTypedInput()) read += keyboard.readCharacter()
        expect(read).toBe('hello')
        expect(keyboard.readCharacter()).toBeUndefined()
    })

    it('queues characters in press order and reads them one at a time', () => {
        const { keyboard } = makeKeyboard()
        keyboard.typeText('ab')
        expect(keyboard.peekCharacter()).toBe('a')
        expect(keyboard.readCharacter()).toBe('a')
        expect(keyboard.peekCharacter()).toBe('b')
        expect(keyboard.typedCount).toBe(1)
    })

    it('reads a character as its code point for the environments with a register', () => {
        const { keyboard } = makeKeyboard()
        keyboard.typeText('A')
        expect(keyboard.readCharacterCode()).toBe(0x41)
        expect(keyboard.readCharacterCode()).toBeUndefined()
    })

    it('takes a paste as typed text, with one line feed per line ending', () => {
        const { keyboard } = makeKeyboard()
        keyboard.typeText('one\r\ntwo\rthree\n')
        let read = ''
        while (keyboard.hasTypedInput()) read += keyboard.readCharacter()
        expect(read).toBe('one\ntwo\nthree\n')
    })

    it('types the character a key produced, including Enter and Backspace', () => {
        const { keyboard } = makeKeyboard()
        keyboard.keyDown({ code: 'KeyA', key: 'A', shiftKey: true })
        keyboard.keyDown({ code: 'Backspace', key: 'Backspace' })
        keyboard.keyDown({ code: 'Enter', key: 'Enter' })
        keyboard.keyDown({ code: 'ArrowUp', key: 'ArrowUp' })
        let read = ''
        while (keyboard.hasTypedInput()) read += keyboard.readCharacter()
        expect(read).toBe('A\b\n')
    })

    it('types again while a key auto-repeats but presses only once', () => {
        const { keyboard } = makeKeyboard()
        keyboard.keyDown(keyDown('x'))
        keyboard.keyDown({ ...keyDown('x'), repeat: true })
        keyboard.keyDown({ ...keyDown('x'), repeat: true })
        expect(keyboard.typedCount).toBe(3)
        expect(keyboard.pendingTransitions).toBe(1)
    })

    it('is not delayed by the hold interval, unlike the key state', () => {
        const { keyboard } = makeKeyboard()
        keyboard.keyDown(keyDown('a'))
        keyboard.keyDown(keyDown('b'))
        //both characters are readable at once, while the two presses are still queued
        expect(keyboard.readCharacter()).toBe('a')
        expect(keyboard.readCharacter()).toBe('b')
        expect(keyboard.isKeyDown(A)).toBe(true)
        expect(keyboard.isKeyDown(B)).toBe(false)
    })

    it('notifies a suspended read when characters are typed', () => {
        const { keyboard } = makeKeyboard()
        let notified = 0
        const unsubscribe = keyboard.onTypedInput(() => (notified += 1))
        keyboard.typeText('a')
        keyboard.keyDown(keyDown('b'))
        expect(notified).toBe(2)
        unsubscribe()
        keyboard.typeText('c')
        expect(notified).toBe(2)
    })
})

describe('the key-state view', () => {
    it('reports the last key pressed and the last key released', () => {
        const { keyboard, clock } = makeKeyboard()
        expect(keyboard.lastKeys()).toEqual({ down: 0, up: 0 })
        keyboard.pressKey(A)
        keyboard.releaseKey(A)
        expect(keyboard.lastKeys()).toEqual({ down: A, up: 0 })
        clock.time += 100
        expect(keyboard.lastKeys()).toEqual({ down: A, up: A })
    })

    it('answers one boolean per key code, as task 19 does', () => {
        const { keyboard } = makeKeyboard()
        keyboard.pressKey(A)
        expect(keyboard.areKeysDown([A, B, SPACE, 0])).toEqual([true, false, false, false])
        expect(keyboard.anyKeyDown()).toBe(true)
    })

    it('ignores a repeated press and a release of a key that is not held', () => {
        const { keyboard } = makeKeyboard()
        keyboard.pressKey(A)
        keyboard.pressKey(A)
        keyboard.releaseKey(B)
        expect(keyboard.pendingTransitions).toBe(1)
    })

    it('releases every held key on focus loss', () => {
        const { keyboard, clock } = makeKeyboard()
        keyboard.pressKey(A)
        keyboard.pressKey(B)
        keyboard.releaseAll()
        //the presses are still observed first: the queue keeps the order they happened in
        expect(keyboard.isKeyDown(A)).toBe(true)
        clock.time += 100
        expect(keyboard.isKeyDown(B)).toBe(true)
        clock.time += 100
        expect(keyboard.isKeyDown(A)).toBe(false)
        clock.time += 100
        expect(keyboard.anyKeyDown()).toBe(false)
        expect(keyboard.pendingTransitions).toBe(0)
    })

    it('samples the modifiers as they are held, without applying a transition', () => {
        const { keyboard } = makeKeyboard()
        keyboard.pressKey(KEY_CODES.SHIFT)
        keyboard.pressKey(KEY_CODES.CTRL)
        expect(keyboard.modifiers()).toEqual({ shift: true, alt: false, ctrl: true })
        expect(keyboard.pendingTransitions).toBe(2)
        keyboard.releaseKey(KEY_CODES.SHIFT)
        expect(keyboard.modifiers()).toEqual({ shift: false, alt: false, ctrl: true })
    })

    it('clears everything on reset, the Terminal clear path', () => {
        const { keyboard } = makeKeyboard()
        keyboard.typeText('abc')
        keyboard.pressKey(A)
        keyboard.reset()
        expect(keyboard.hasTypedInput()).toBe(false)
        expect(keyboard.pendingTransitions).toBe(0)
        expect(keyboard.anyKeyDown()).toBe(false)
        expect(keyboard.lastKeys()).toEqual({ down: 0, up: 0 })
    })
})

describe('the hold interval', () => {
    /** A program that polls the key state in a loop, one poll per simulated frame. */
    function poll(
        keyboard: Keyboard,
        clock: { time: number },
        code: number,
        frames: number,
        frameMs: number
    ) {
        const seen: boolean[] = []
        for (let frame = 0; frame < frames; frame++) {
            seen.push(keyboard.isKeyDown(code))
            clock.time += frameMs
        }
        return seen
    }

    it('lets a polling program observe a tap that lasted a millisecond', () => {
        const { keyboard, clock } = makeKeyboard(30)
        keyboard.pressKey(SPACE)
        clock.time = 1
        keyboard.releaseKey(SPACE)
        //the program only gets to poll long after the tap, once a frame
        clock.time = 100
        expect(poll(keyboard, clock, SPACE, 4, 16)).toEqual([true, true, false, false])
    })

    it('holds a state for the interval even when the program polls far faster', () => {
        const { keyboard, clock } = makeKeyboard(30)
        keyboard.pressKey(SPACE)
        keyboard.releaseKey(SPACE)
        const seen = poll(keyboard, clock, SPACE, 60, 1)
        expect(seen.filter((down) => down)).toHaveLength(30)
        expect(seen.slice(0, 30).every((down) => down)).toBe(true)
        expect(seen.slice(30).every((down) => !down)).toBe(true)
    })

    it('applies at most one transition per read, so no state is skipped', () => {
        const { keyboard, clock } = makeKeyboard(0)
        keyboard.pressKey(A)
        keyboard.releaseKey(A)
        keyboard.pressKey(B)
        clock.time = 10_000
        //even with no interval at all, a single read never swallows a whole press and release
        expect(keyboard.areKeysDown([A, B])).toEqual([true, false])
        expect(keyboard.areKeysDown([A, B])).toEqual([false, false])
        expect(keyboard.areKeysDown([A, B])).toEqual([false, true])
    })
})
