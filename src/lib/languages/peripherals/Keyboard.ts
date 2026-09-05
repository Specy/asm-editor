import { hostNow, type ClockReader } from './ProgramClock'
import {
    KEY_CODES,
    keyCodeFromEvent,
    typedCharacterFromEvent,
    type KeyCode,
    type KeyboardEventLike
} from './keyCodes'

/**
 * The Keyboard peripheral: keyboard input for a program interacting with the Screen
 * ([ADR 0008](../../../../docs/adr/0008-poll-keyboard-and-mouse-input.md)). Input is polled, never
 * delivered as a CPU interrupt, and a program observes it in two ways:
 *
 * - the **typed-character queue**, which holds every character in press order and never drops one:
 *   an availability check asks whether it is empty and a read dequeues one character. It also
 *   answers the Terminal's character, string and numeric reads in graphical use
 *   ([ADR 0009](../../../../docs/adr/0009-share-screen-keyboard-input-with-terminal.md)).
 * - the **key-state view**, which answers whether given keys are down and remembers the last key
 *   pressed and the last key released, in EASy68K's key codes.
 *
 * Key transitions are queued as the GUI delivers them and applied only when the program reads the
 * key state, at most one per read and never faster than the hold interval, so a tap that lasts a
 * millisecond is still observed by a program that polls every frame. Typed characters do not wait
 * for the interval: they enter the queue the moment the key is pressed.
 *
 * Plain TypeScript with no Svelte runes and no DOM types, like the other peripherals: a Core reads
 * it from inside its synchronous execution and it has to run under node in tests. The phase 4
 * widget owns focus, shortcut suppression and the DOM listeners; it calls `keyDown`, `keyUp`,
 * `typeText` and `releaseAll` and nothing here knows a Screen exists.
 */

/**
 * The shortest time a queued transition is held before the next one may be applied. 30 ms is a
 * placeholder to validate in phase 8: long enough that a program polling once a frame sees every
 * state, short enough that fast typing is not throttled into a visible lag. Program time coincides
 * with host time, which is why the interval is in milliseconds (ADR 0010).
 */
export const DEFAULT_KEY_HOLD_INTERVAL_MS = 30

export type KeyboardOptions = {
    /** Host time source, injected so tests can drive the hold interval. */
    now?: ClockReader
    holdIntervalMs?: number
}

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

type KeyTransition = {
    code: KeyCode
    down: boolean
}

/** Neither task 19 nor the Z80 key ports have a "no key" code, so both start at zero, as EASy68K's do. */
const NO_KEY: KeyCode = 0

export class Keyboard {
    private readonly now: ClockReader
    private readonly _holdIntervalMs: number
    /** Typed characters as code points, in press order. Nothing but a read or a reset removes one. */
    private readonly typed: number[] = []
    /** Transitions the GUI delivered and the program has not observed yet. */
    private readonly transitions: KeyTransition[] = []
    /** The key state the program sees, which only `applyPendingTransition` changes. */
    private readonly pressed = new Set<KeyCode>()
    /** The keys physically held, as delivered; ahead of `pressed` by the queued transitions. */
    private readonly held = new Set<KeyCode>()
    private readonly listeners = new Set<() => void>()
    private _lastKeyDown: KeyCode = NO_KEY
    private _lastKeyUp: KeyCode = NO_KEY
    private appliedAt: number | null = null

    constructor(options: KeyboardOptions = {}) {
        this.now = options.now ?? hostNow
        this._holdIntervalMs = options.holdIntervalMs ?? DEFAULT_KEY_HOLD_INTERVAL_MS
    }

    get holdIntervalMs(): number {
        return this._holdIntervalMs
    }

    // ------------------------------------------------------------ GUI input

    /**
     * A key went down. Types the character it produced and queues the transition; auto-repeat types
     * again, like a terminal, but queues nothing, because the key never came back up.
     */
    keyDown(event: KeyboardEventLike): void {
        const character = typedCharacterFromEvent(event)
        if (character !== undefined) this.typeText(character)
        const code = keyCodeFromEvent(event)
        if (code === undefined || event.repeat) return
        this.pressKey(code)
    }

    /** A key came up. Types nothing: a character is typed when the key goes down. */
    keyUp(event: KeyboardEventLike): void {
        const code = keyCodeFromEvent(event)
        if (code === undefined) return
        this.releaseKey(code)
    }

    /** Queues a press by key code, without typing a character. */
    pressKey(code: KeyCode): void {
        if (this.held.has(code)) return
        this.held.add(code)
        this.transitions.push({ code, down: true })
    }

    /** Queues a release by key code. A key that is not held releases nothing. */
    releaseKey(code: KeyCode): void {
        if (!this.held.delete(code)) return
        this.transitions.push({ code, down: false })
    }

    /**
     * Releases every held key, for focus loss: a release the Screen never received must not leave a
     * key stuck down for the program (ADR 0008). The releases are queued like any other transition,
     * so a program still observes the presses that preceded them.
     */
    releaseAll(): void {
        for (const code of [...this.held]) this.releaseKey(code)
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

    // ---------------------------------------------------- key-state reads

    /** Whether one key is down. Applies at most one queued transition, like every key-state read. */
    isKeyDown(code: KeyCode): boolean {
        this.applyPendingTransition()
        return this.pressed.has(code)
    }

    /** EASy68K's task 19 with up to four key codes: one answer per code, in the same order. */
    areKeysDown(codes: readonly KeyCode[]): boolean[] {
        this.applyPendingTransition()
        return codes.map((code) => this.pressed.has(code))
    }

    anyKeyDown(): boolean {
        this.applyPendingTransition()
        return this.pressed.size > 0
    }

    /** EASy68K's task 19 with D1.L = 0. Both codes are 0 until the first press and release. */
    lastKeys(): LastKeys {
        this.applyPendingTransition()
        return { down: this._lastKeyDown, up: this._lastKeyUp }
    }

    /** How many transitions are still queued; the tests and the phase 4 widget look at it. */
    get pendingTransitions(): number {
        return this.transitions.length
    }

    /**
     * The modifiers a Mouse snapshot records. Read from the physically held keys rather than from
     * the applied state, and applying nothing: a click carries the modifiers that were down when it
     * happened, and the hold interval exists to pace key-state polling, not to distort a snapshot.
     */
    modifiers(): KeyModifiers {
        return {
            shift: this.held.has(KEY_CODES.SHIFT),
            alt: this.held.has(KEY_CODES.ALT),
            ctrl: this.held.has(KEY_CODES.CTRL)
        }
    }

    /** The Keyboard's half of the Terminal's clear path. Subscriptions survive it, the GUI's do. */
    reset(): void {
        this.typed.length = 0
        this.transitions.length = 0
        this.pressed.clear()
        this.held.clear()
        this._lastKeyDown = NO_KEY
        this._lastKeyUp = NO_KEY
        this.appliedAt = null
    }

    /**
     * Applies one queued transition when the hold interval has passed since the last one. One per
     * read means a program observes every state at least once however slowly it polls; the interval
     * means a state lasts long enough for a program that polls once a frame to see it (ADR 0008).
     * This mirrors the upstream TRS-80 keyboard, which releases one queued transition per 50,000
     * t-states measured at read time.
     */
    private applyPendingTransition(): void {
        const next = this.transitions[0]
        if (next === undefined) return
        const now = this.now()
        if (this.appliedAt !== null && now - this.appliedAt < this._holdIntervalMs) return
        this.transitions.shift()
        this.appliedAt = now
        if (next.down) {
            this.pressed.add(next.code)
            this._lastKeyDown = next.code
        } else {
            this.pressed.delete(next.code)
            this._lastKeyUp = next.code
        }
    }
}
