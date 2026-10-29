import {
    KEY_CODES,
    keyCodeFromEvent,
    typedCharacterFromEvent,
    type KeyCode,
    type KeyboardEventLike
} from './keyCodes'

/**
 * The Keyboard peripheral: keyboard input for a program interacting with the Screen
 * ([ADR 0008](../../../../../../docs/adr/0008-poll-keyboard-and-mouse-input.md)). Input is polled, and a
 * program observes it in two ways:
 *
 * - the **typed-character queue**, which holds every character in press order and never drops one:
 *   an availability check asks whether it is empty and a read dequeues one character. It also
 *   answers the Terminal's character, string and numeric reads in graphical use
 *   ([ADR 0009](../../../../../../docs/adr/0009-share-screen-keyboard-input-with-terminal.md)).
 *   EASy68K keeps one pending character, which a second keystroke overwrites; this queue keeps them
 *   all, on purpose.
 * - the **key-state view**, which answers whether given keys are down and remembers the last key
 *   pressed and the last key released, in EASy68K's key codes.
 *
 * The key state is EASy68K's ([ADR 0066](../../../../../../docs/adr/0066-key-state-changes-at-the-event.md)):
 * a key going down is down at once and becomes the last key pressed, a key coming up is up at once
 * and becomes the last key released, and a read answers the state as it is now, with no queue and
 * no pacing. Its `FormKeyDown` and `FormKeyUp` set `keys[]`, `keyDownCode` and `keyUpCode` in the
 * event itself, and `getKeyState`, task 19, only reads them (`simIOu.cpp` in EASy68K 5.16.1). A tap
 * that falls between two reads is gone from the held keys, but the last-key codes keep it.
 *
 * A key going down or up is also told at once to whoever listens with `onKeyEvent`: the M68K
 * adapter, whose program can ask for an IRQ on either ([ADR 0065](../../../../../../docs/adr/0065-m68k-devices-deliver-irqs.md)).
 * The state is changed before the listener hears of it, so a handler reads the key that raised it.
 *
 * Key state is live input: Undo does not replay it (ADR 0008).
 *
 * Plain TypeScript with no Svelte runes and no DOM types, like the other peripherals: a Core reads
 * it from inside its synchronous execution and it has to run under node in tests. The Screen
 * widget owns focus, shortcut suppression and the DOM listeners; it calls `keyDown`, `keyUp`,
 * `typeText` and `releaseAll` and nothing here knows a Screen exists.
 */

/** The modifier keys a Mouse snapshot records, as EASy68K's task 61 reports them. */
export type KeyModifiers = {
    shift: boolean
    alt: boolean
    ctrl: boolean
}

/** The last key pressed and the last key released, EASy68K's task 19 with D1.L = 0. */
export type LastKeys = {
    down: KeyCode
    up: KeyCode
}

/** A key going down or coming up, as a listener of `onKeyEvent` hears it. */
export type KeyEventKind = 'keyDown' | 'keyUp'

/** Neither task 19 nor the Z80 key ports have a "no key" code, so both start at zero, as EASy68K's do. */
const NO_KEY: KeyCode = 0

export class Keyboard {
    /** Typed characters as code points, in press order. Nothing but a read or a reset removes one. */
    private readonly typed: number[] = []
    /** The keys held now, EASy68K's `keys[]`. */
    private readonly down = new Set<KeyCode>()
    private readonly listeners = new Set<() => void>()
    private readonly keyEventListeners = new Set<(event: KeyEventKind) => void>()
    private _lastKeyDown: KeyCode = NO_KEY
    private _lastKeyUp: KeyCode = NO_KEY

    // ------------------------------------------------------------ GUI input

    /**
     * A key went down. Types the character it produced and presses the key. Auto-repeat types
     * again, like a terminal, and goes down again, as EASy68K's `FormKeyDown` does on every repeat
     * Windows sends: the key is down, it is the last key down, and a key-down IRQ is raised again.
     */
    keyDown(event: KeyboardEventLike): void {
        const character = typedCharacterFromEvent(event)
        if (character !== undefined) this.typeText(character)
        const code = keyCodeFromEvent(event)
        if (code === undefined) return
        if (event.repeat) this.repeatKey(code)
        else this.pressKey(code)
    }

    /** A key came up. Types nothing: a character is typed when the key goes down. */
    keyUp(event: KeyboardEventLike): void {
        const code = keyCodeFromEvent(event)
        if (code === undefined) return
        this.releaseKey(code)
    }

    /**
     * Presses a key by its code, without typing a character: it is down and the last key pressed from
     * now on, before any listener hears of it. A key already down presses nothing.
     */
    pressKey(code: KeyCode): void {
        if (this.down.has(code)) return
        this.down.add(code)
        this._lastKeyDown = code
        this.tell('keyDown')
    }

    /**
     * An auto-repeat of a key held down: it goes down again, whether or not the key state still had
     * it down, becomes the last key down again and is told again, so a program that asked for a
     * key-down IRQ gets one per repeat, as in EASy68K.
     */
    repeatKey(code: KeyCode): void {
        this.down.add(code)
        this._lastKeyDown = code
        this.tell('keyDown')
    }

    /**
     * Releases a key by its code: it is up and the last key released from now on, before any listener
     * hears of it. A key that is not down releases nothing.
     */
    releaseKey(code: KeyCode): void {
        if (!this.down.delete(code)) return
        this._lastKeyUp = code
        this.tell('keyUp')
    }

    /**
     * Releases every held key, for focus loss: a release the Screen never received must not leave a
     * key stuck down for the program (ADR 0008). Each is an ordinary release, which updates the last
     * key released and tells the listeners.
     */
    releaseAll(): void {
        for (const code of [...this.down]) this.releaseKey(code)
    }

    /**
     * Appends text to the typed queue, for typing and for a paste, which ADR 0009's shared input
     * treats as typed text. Line endings become a single line feed so a line read sees one Enter.
     */
    typeText(text: string): void {
        const normalized = text.replace(/\r\n?/g, '\n')
        if (normalized.length === 0) return
        for (const character of normalized) this.typed.push(character.codePointAt(0) ?? 0)
        for (const listener of [...this.listeners]) listener()
    }

    // --------------------------------------------------- typed-input reads

    /** EASy68K's task 7 and MARS's receiver Ready bit: is there a character to read? */
    hasTypedInput(): boolean {
        return this.typed.length > 0
    }

    get typedCount(): number {
        return this.typed.length
    }

    /** Reads one typed character without consuming it. */
    peekCharacter(): string | undefined {
        const code = this.typed[0]
        return code === undefined ? undefined : String.fromCodePoint(code)
    }

    /** Dequeues one typed character, or undefined when the queue is empty. */
    readCharacter(): string | undefined {
        const code = this.typed.shift()
        return code === undefined ? undefined : String.fromCodePoint(code)
    }

    /** Puts back a character a polled device took, at the front of the queue, for Undo. */
    unreadCharacter(character: string): void {
        this.typed.unshift(character.codePointAt(0) ?? 0)
    }

    /**
     * Dequeues one typed character as its Unicode code point, for the environments whose register
     * holds a number. A character outside their byte is the adapter's problem, as in the Z80
     * console, which substitutes a question mark.
     */
    readCharacterCode(): number | undefined {
        return this.typed.shift()
    }

    clearTypedInput(): void {
        this.typed.length = 0
    }

    /**
     * Called whenever characters are typed, so a Terminal read suspended on Screen input can resume
     * without polling. Returns the unsubscribe.
     */
    onTypedInput(listener: () => void): () => void {
        this.listeners.add(listener)
        return () => {
            this.listeners.delete(listener)
        }
    }

    /**
     * Called when a key goes down or comes up, once the key state shows it: what a device IRQ needs.
     * Each auto-repeat is told as a key going down, as EASy68K raises its key-down IRQ on every
     * repeat; a reset releases nothing. Returns the unsubscribe.
     */
    onKeyEvent(listener: (event: KeyEventKind) => void): () => void {
        this.keyEventListeners.add(listener)
        return () => {
            this.keyEventListeners.delete(listener)
        }
    }

    private tell(event: KeyEventKind): void {
        for (const listener of [...this.keyEventListeners]) listener(event)
    }

    // ---------------------------------------------------- key-state reads

    /** Whether one key is down now. */
    isKeyDown(code: KeyCode): boolean {
        return this.down.has(code)
    }

    /** EASy68K's task 19 with up to four key codes: one answer per code, in the same order. */
    areKeysDown(codes: readonly KeyCode[]): boolean[] {
        return codes.map((code) => this.down.has(code))
    }

    anyKeyDown(): boolean {
        return this.down.size > 0
    }

    /** EASy68K's task 19 with D1.L = 0. Both codes are 0 until the first press and release. */
    lastKeys(): LastKeys {
        return { down: this._lastKeyDown, up: this._lastKeyUp }
    }

    /** The modifiers a Mouse snapshot records: those held when the click happened. */
    modifiers(): KeyModifiers {
        return {
            shift: this.down.has(KEY_CODES.SHIFT),
            alt: this.down.has(KEY_CODES.ALT),
            ctrl: this.down.has(KEY_CODES.CTRL)
        }
    }

    /** The Keyboard's half of the Terminal's clear path. Subscriptions survive it, the GUI's do. */
    reset(): void {
        this.typed.length = 0
        this.down.clear()
        this._lastKeyDown = NO_KEY
        this._lastKeyUp = NO_KEY
    }
}
