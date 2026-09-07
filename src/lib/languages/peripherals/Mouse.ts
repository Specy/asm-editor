import { hostNow, type ClockReader } from './ProgramClock'
import type { KeyModifiers } from './Keyboard'
import type { ScreenSize } from './screen/Screen'

/**
 * The Mouse peripheral: pointing input for a program interacting with the Screen
 * ([ADR 0008](../../../../docs/adr/0008-poll-keyboard-and-mouse-input.md)). Polled like the
 * Keyboard, and observed through three views, EASy68K's task 61 modes: the current state, the
 * snapshot taken at the last button down and the snapshot taken at the last button up. Each snapshot
 * persists until the next event of its kind, so a click that happens between two polls is still
 * seen, and a program tells a new click from an old one by the event counter.
 *
 * Positions are the Screen's logical pixels with its top-left origin, independent of GUI zoom, and
 * never leave the Screen: the widget converts a pointer position into logical pixels and this
 * clamps it, so a drag past the right edge pins X to the last column while Y keeps following. The
 * Screen is asked for its size at every event rather than at construction, so a program that
 * resizes mid-run clamps against the new size immediately.
 *
 * Plain TypeScript with no Svelte runes and no DOM types, like the other peripherals. The phase 4
 * widget owns pointer capture, the context menu and middle-click suppression, and the window-blur
 * release; it calls `moveTo`, `buttonDown`, `buttonUp` and `releaseAll`.
 */

export type MouseButton = 'left' | 'right' | 'middle'

export type MouseSnapshot = {
    x: number
    y: number
    left: boolean
    right: boolean
    middle: boolean
    shift: boolean
    alt: boolean
    ctrl: boolean
    /** Only a last-down snapshot ever carries it: EASy68K's double-click flag. */
    double: boolean
    /** The event counter at the moment of the snapshot; 0 means the event never happened. */
    event: number
}

/** What the Mouse needs from a Screen. `Screen` satisfies it. */
export type MouseScreen = {
    getSize(): ScreenSize
}

/** What the Mouse needs from a Keyboard, to sample the modifiers a click carries. */
export type MouseModifierSource = {
    modifiers(): KeyModifiers
}

export type MouseOptions = {
    screen: MouseScreen
    /** Omitted, every snapshot reports its modifiers as released. */
    keyboard?: MouseModifierSource
    /** Host time source, injected so tests can drive the double-click interval. */
    now?: ClockReader
    doubleClickIntervalMs?: number
}

/**
 * Two presses of the same button closer together than this are a double click. 500 ms is Windows'
 * own default, which is what EASy68K's flag reports; a placeholder to validate in phase 8. Distance
 * is deliberately not part of it: positions are clamped logical pixels, which can be one GUI pixel
 * or twenty depending on zoom, so a pixel threshold would mean something different per Screen.
 */
export const DEFAULT_DOUBLE_CLICK_INTERVAL_MS = 500

/** The counter is a byte, so the Z80 can read it from one port and any program can compare it. */
export const MOUSE_EVENT_COUNTER_MODULO = 256

const NO_BUTTONS = { left: false, right: false, middle: false }
const NO_MODIFIERS: KeyModifiers = { shift: false, alt: false, ctrl: false }

/** The answer of a view whose event has not happened yet, all zeroes as EASy68K's registers are. */
const EMPTY_SNAPSHOT: MouseSnapshot = {
    x: 0,
    y: 0,
    ...NO_BUTTONS,
    ...NO_MODIFIERS,
    double: false,
    event: 0
}

export class Mouse {
    private readonly screen: MouseScreen
    private readonly keyboard: MouseModifierSource | undefined
    private readonly now: ClockReader
    private readonly doubleClickIntervalMs: number
    private _x = 0
    private _y = 0
    private readonly buttons = { ...NO_BUTTONS }
    private _eventCount = 0
    private _lastDown: MouseSnapshot = EMPTY_SNAPSHOT
    private _lastUp: MouseSnapshot = EMPTY_SNAPSHOT
    private previousDownButton: MouseButton | null = null
    private previousDownAt: number | null = null

    constructor(options: MouseOptions) {
        this.screen = options.screen
        this.keyboard = options.keyboard
        this.now = options.now ?? hostNow
        this.doubleClickIntervalMs =
            options.doubleClickIntervalMs ?? DEFAULT_DOUBLE_CLICK_INTERVAL_MS
    }

    // ------------------------------------------------------------ GUI input

    /** The pointer moved, in logical Screen pixels. A move that clamps to the same pixel is no event. */
    moveTo(x: number, y: number): void {
        if (this.place(x, y)) this.countEvent()
    }

    /** A button went down at the given position, or where the pointer already is. */
    buttonDown(button: MouseButton, x?: number, y?: number): void {
        this.place(x, y)
        if (this.buttons[button]) return
        this.buttons[button] = true
        this.countEvent()
        const now = this.now()
        const double =
            this.previousDownButton === button &&
            this.previousDownAt !== null &&
            now - this.previousDownAt <= this.doubleClickIntervalMs
        this.previousDownButton = button
        this.previousDownAt = now
        this._lastDown = this.snapshot(double)
    }

    /** A button came up. Losing browser-window focus releases through `releaseAll` instead. */
    buttonUp(button: MouseButton, x?: number, y?: number): void {
        this.place(x, y)
        if (!this.buttons[button]) return
        this.buttons[button] = false
        this.countEvent()
        this._lastUp = this.snapshot(false)
    }

    /**
     * Releases every held button, for the loss of browser-window focus: a release the page never
     * received must not leave a button stuck down for the program (ADR 0008). Each release is a
     * real event, so the program sees the button go up.
     */
    releaseAll(): void {
        for (const button of ['left', 'right', 'middle'] as const) this.buttonUp(button)
    }

    // ----------------------------------------------------------- the views

    /** EASy68K's task 61 mode 0: where the pointer is and what is held right now. */
    state(): MouseSnapshot {
        return this.snapshot(false)
    }

    /** EASy68K's task 61 mode 2: the state at the last button down, with the double-click flag. */
    lastDown(): MouseSnapshot {
        return this._lastDown
    }

    /** EASy68K's task 61 mode 1: the state at the last button up. */
    lastUp(): MouseSnapshot {
        return this._lastUp
    }

    get x(): number {
        return this._x
    }

    get y(): number {
        return this._y
    }

    isButtonDown(button: MouseButton): boolean {
        return this.buttons[button]
    }

    /** Counts every event, wrapping at 256: a program compares it for change, never for order. */
    get eventCount(): number {
        return this._eventCount
    }

    /** The Mouse's half of the Terminal's clear path. */
    reset(): void {
        this._x = 0
        this._y = 0
        this.buttons.left = false
        this.buttons.right = false
        this.buttons.middle = false
        this._eventCount = 0
        this._lastDown = EMPTY_SNAPSHOT
        this._lastUp = EMPTY_SNAPSHOT
        this.previousDownButton = null
        this.previousDownAt = null
    }

    /** Moves the pointer to the nearest pixel inside the Screen; answers whether it ended elsewhere. */
    private place(x: number | undefined, y: number | undefined): boolean {
        if (x === undefined || y === undefined) return false
        const { width, height } = this.screen.getSize()
        const nextX = clamp(Math.floor(x), width)
        const nextY = clamp(Math.floor(y), height)
        if (nextX === this._x && nextY === this._y) return false
        this._x = nextX
        this._y = nextY
        return true
    }

    private countEvent(): void {
        this._eventCount = (this._eventCount + 1) % MOUSE_EVENT_COUNTER_MODULO
    }

    private snapshot(double: boolean): MouseSnapshot {
        return {
            x: this._x,
            y: this._y,
            ...this.buttons,
            ...(this.keyboard?.modifiers() ?? NO_MODIFIERS),
            double,
            event: this._eventCount
        }
    }
}

function clamp(value: number, size: number): number {
    if (!Number.isFinite(value)) return 0
    return Math.min(Math.max(value, 0), Math.max(0, size - 1))
}
