import { describe, expect, it } from 'vite-plus/test'
import { Keyboard, type KeyEventKind } from './Keyboard'
import { KEY_CODES, letterKeyCode } from './keyCodes'

const A = letterKeyCode('a')
const B = letterKeyCode('b')
const SPACE = KEY_CODES.SPACE

function makeKeyboard() {
    return { keyboard: new Keyboard() }
}

/** Every key event the keyboard tells, in order. */
function listen(keyboard: Keyboard) {
    const heard: KeyEventKind[] = []
    const stop = keyboard.onKeyEvent((event) => heard.push(event))
    return { heard, stop }
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

    it('types again and goes down again on every auto-repeat, as EASy68K does', () => {
        const { keyboard } = makeKeyboard()
        const { heard } = listen(keyboard)
        keyboard.keyDown(keyDown('x'))
        keyboard.keyDown(keyDown('y'))
        //a repeat of x after y went down makes x the last key down again, and is told again
        keyboard.keyDown({ ...keyDown('x'), repeat: true })
        keyboard.keyDown({ ...keyDown('x'), repeat: true })
        expect(keyboard.typedCount).toBe(4)
        expect(heard).toEqual(['keyDown', 'keyDown', 'keyDown', 'keyDown'])
        expect(keyboard.isKeyDown(letterKeyCode('x'))).toBe(true)
        expect(keyboard.lastKeys().down).toBe(letterKeyCode('x'))
    })

    it('keeps every character after the keys that typed them are up again', () => {
        const { keyboard } = makeKeyboard()
        keyboard.keyDown(keyDown('a'))
        keyboard.keyDown(keyDown('b'))
        keyboard.keyUp(keyDown('a'))
        keyboard.keyUp(keyDown('b'))
        //the key state has moved on, and the queue still holds both characters, in order
        expect(keyboard.anyKeyDown()).toBe(false)
        expect(keyboard.readCharacter()).toBe('a')
        expect(keyboard.readCharacter()).toBe('b')
    })

    it('puts a character a polled device took back at the front, for Undo', () => {
        const { keyboard } = makeKeyboard()
        keyboard.typeText('xy')
        expect(keyboard.readCharacter()).toBe('x')
        keyboard.unreadCharacter('x')
        expect(keyboard.readCharacter()).toBe('x')
        expect(keyboard.readCharacter()).toBe('y')
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
    //EASy68K's: a key's state and the last-key codes change at the event, and a read only looks
    //([ADR 0066](../../../../../../docs/adr/0066-key-state-changes-at-the-event.md))
    it('shows a press at once', () => {
        const { keyboard } = makeKeyboard()
        keyboard.pressKey(A)
        keyboard.pressKey(B)
        //both presses in one read: nothing is queued behind the first
        expect(keyboard.areKeysDown([A, B])).toEqual([true, true])
        expect(keyboard.isKeyDown(A)).toBe(true)
        expect(keyboard.lastKeys()).toEqual({ down: B, up: 0 })
    })

    it('shows a release at once', () => {
        const { keyboard } = makeKeyboard()
        keyboard.pressKey(A)
        expect(keyboard.isKeyDown(A)).toBe(true)
        keyboard.releaseKey(A)
        expect(keyboard.isKeyDown(A)).toBe(false)
        expect(keyboard.anyKeyDown()).toBe(false)
        expect(keyboard.lastKeys()).toEqual({ down: A, up: A })
    })

    it('reports the last key pressed and the last key released', () => {
        const { keyboard } = makeKeyboard()
        expect(keyboard.lastKeys()).toEqual({ down: 0, up: 0 })
        keyboard.pressKey(A)
        keyboard.pressKey(B)
        keyboard.releaseKey(A)
        expect(keyboard.lastKeys()).toEqual({ down: B, up: A })
        //a key still held stays down whatever came after it
        expect(keyboard.areKeysDown([A, B])).toEqual([false, true])
    })

    it('keeps a tap that fell between two reads in the last-key codes', () => {
        const { keyboard } = makeKeyboard()
        expect(keyboard.isKeyDown(SPACE)).toBe(false)
        keyboard.pressKey(SPACE)
        keyboard.releaseKey(SPACE)
        //the next read finds the key up again, as EASy68K's would, and the codes say it was tapped
        expect(keyboard.isKeyDown(SPACE)).toBe(false)
        expect(keyboard.lastKeys()).toEqual({ down: SPACE, up: SPACE })
    })

    it('answers the same however often it is read', () => {
        const { keyboard } = makeKeyboard()
        keyboard.pressKey(SPACE)
        const held = Array.from({ length: 60 }, () => keyboard.isKeyDown(SPACE))
        expect(held.every((down) => down)).toBe(true)
        keyboard.releaseKey(SPACE)
        const released = Array.from({ length: 60 }, () => keyboard.isKeyDown(SPACE))
        expect(released.some((down) => down)).toBe(false)
        expect(keyboard.lastKeys()).toEqual({ down: SPACE, up: SPACE })
    })

    it('answers one boolean per key code, as task 19 does', () => {
        const { keyboard } = makeKeyboard()
        keyboard.pressKey(A)
        expect(keyboard.areKeysDown([A, B, SPACE, 0])).toEqual([true, false, false, false])
        expect(keyboard.anyKeyDown()).toBe(true)
    })

    it('ignores a repeated press and a release of a key that is not held', () => {
        const { keyboard } = makeKeyboard()
        const { heard } = listen(keyboard)
        keyboard.pressKey(A)
        keyboard.pressKey(A)
        keyboard.releaseKey(B)
        expect(heard).toEqual(['keyDown'])
        expect(keyboard.lastKeys()).toEqual({ down: A, up: 0 })
        expect(keyboard.isKeyDown(A)).toBe(true)
    })

    it('releases every held key at once on focus loss', () => {
        const { keyboard } = makeKeyboard()
        keyboard.pressKey(A)
        keyboard.pressKey(B)
        const { heard } = listen(keyboard)
        keyboard.releaseAll()
        expect(keyboard.areKeysDown([A, B])).toEqual([false, false])
        expect(keyboard.anyKeyDown()).toBe(false)
        //each one an ordinary release, so the last of them is the last key released
        expect(heard).toEqual(['keyUp', 'keyUp'])
        expect(keyboard.lastKeys()).toEqual({ down: B, up: B })
    })

    it('samples the modifiers as they are held', () => {
        const { keyboard } = makeKeyboard()
        keyboard.pressKey(KEY_CODES.SHIFT)
        keyboard.pressKey(KEY_CODES.CTRL)
        expect(keyboard.modifiers()).toEqual({ shift: true, alt: false, ctrl: true })
        keyboard.releaseKey(KEY_CODES.SHIFT)
        expect(keyboard.modifiers()).toEqual({ shift: false, alt: false, ctrl: true })
    })

    it('clears everything on reset, the Terminal clear path', () => {
        const { keyboard } = makeKeyboard()
        keyboard.typeText('abc')
        keyboard.pressKey(A)
        keyboard.reset()
        expect(keyboard.hasTypedInput()).toBe(false)
        expect(keyboard.anyKeyDown()).toBe(false)
        expect(keyboard.lastKeys()).toEqual({ down: 0, up: 0 })
    })
})

describe('key events as they happen', () => {
    //what an M68K program's key IRQ hears ([ADR 0065](../../../../../../docs/adr/0065-m68k-devices-deliver-irqs.md))
    it('tells a listener each key down and up at once', () => {
        const { keyboard } = makeKeyboard()
        const { heard, stop } = listen(keyboard)
        keyboard.keyDown(keyDown('a'))
        keyboard.keyDown({ ...keyDown('a'), repeat: true })
        keyboard.pressKey(SPACE)
        keyboard.keyUp(keyDown('a'))
        keyboard.releaseKey(B)
        //the repeat is told as a key going down, as EASy68K raises its key-down IRQ on every repeat
        expect(heard).toEqual(['keyDown', 'keyDown', 'keyDown', 'keyUp'])
        keyboard.releaseAll()
        expect(heard).toEqual(['keyDown', 'keyDown', 'keyDown', 'keyUp', 'keyUp'])
        stop()
        keyboard.pressKey(A)
        expect(heard).toHaveLength(5)
    })

    it('has already changed the key state when a listener hears the event', () => {
        //so a key-down handler that reads task 19 reads its own key, not the one before
        const { keyboard } = makeKeyboard()
        const seen: string[] = []
        keyboard.onKeyEvent((event) => {
            const { down, up } = keyboard.lastKeys()
            const key = event === 'keyDown' ? down : up
            seen.push(`${event} ${String.fromCharCode(key)} ${keyboard.isKeyDown(key)}`)
        })
        keyboard.pressKey(A)
        keyboard.releaseKey(A)
        keyboard.pressKey(B)
        expect(seen).toEqual(['keyDown A true', 'keyUp A false', 'keyDown B true'])
    })

    it('tells nothing of typed text, which presses no key, or of a reset', () => {
        const { keyboard } = makeKeyboard()
        const { heard } = listen(keyboard)
        keyboard.typeText('pasted')
        keyboard.pressKey(A)
        keyboard.reset()
        expect(heard).toEqual(['keyDown'])
    })
})
