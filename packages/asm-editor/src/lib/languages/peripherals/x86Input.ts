import { linuxKeyCode } from './linuxKeyCodes'
import type { MouseButton, MouseScreen } from './Mouse'

/**
 * The Screen's keys and pointer as an x86 program receives them: the input events of the guest's
 * keyboard and of QEMU's USB tablet, read from `/dev/input`
 * ([x86 devices](../../../../../../docs/design/x86-devices.md), "The keyboard device" and "The
 * pointer"). evdev is how x86 observes the **Keyboard** and the **Mouse**, so this is no Peripheral
 * of its own: the Screen widget hands it the host's events instead of handing them to the Keyboard
 * and Mouse, which keep EASy68K's views for the other Targets.
 *
 * Each host event becomes one report, the events of `struct input_event` without their time, for
 * the keyboard or the tablet:
 *
 * - a key going down, up or repeating is `EV_KEY` with its Linux code (`linuxKeyCodes.ts`) and 1, 0
 *   or 2. Repeats are the browser's, as the guest's are its host's. A key that goes down again while
 *   it is down is a repeat, the AT keyboard driver's rule, and a key that comes up without having
 *   gone down sends nothing, as the input core drops it;
 * - a pointer move is `EV_ABS` `ABS_X` and `ABS_Y`, for the axes that changed, from 0 to 32767
 *   across the whole Screen as QEMU scales them, ⌊x × 32767 ÷ width⌋ of the whole logical pixel
 *   the pointer is on. Positions are clamped to the Screen, so a drag past an edge pins that axis
 *   ([ADR 0008](../../../../../../docs/adr/0008-poll-keyboard-and-mouse-input.md));
 * - a button is `EV_KEY` `BTN_LEFT`, `BTN_RIGHT` or `BTN_MIDDLE`, after a move to where it happened;
 * - a wheel notch is `EV_REL` `REL_WHEEL`, +1 away from the user and -1 towards.
 *
 * What the guest's drivers add (`MSC_SCAN` before keys and buttons, `REL_WHEEL_HI_RES` beside the
 * wheel, `EV_LED` from the lock keys), the closing `SYN_REPORT` and the time are the Core's, which
 * queues the report for every reader of the device (the plan's "The Core's contract").
 *
 * Reports go to the sink the adapter sets, and nowhere while there is none: nothing is tracked
 * then either, so a key already held when a sink arrives goes down for it at its next repeat.
 *
 * Plain TypeScript with no Svelte runes and no DOM types, like the Keyboard and the Mouse.
 */

/** The devices the host delivers events to; the guest's other input devices never receive any. */
export type X86InputDeviceId = 'keyboard' | 'tablet'

/**
 * The type of the interrupt an x86 run shows while its program waits for nothing but the Screen's
 * keys or pointer, as a read of standard input shows "Program input"; its message says what for,
 * "Waiting for a key", and the Screen asks to be clicked.
 */
export const X86_INPUT_INTERRUPT = 'InputDevice'

/** One input event as Linux's `struct input_event` has it, without its time. */
export type X86InputEvent = { type: number; code: number; value: number }

/** Where each report goes: the adapter's, which hands it to the Core. */
export type X86InputSink = (device: X86InputDeviceId, events: X86InputEvent[]) => void

/** The part of a DOM `KeyboardEvent` this reads: the physical key alone. */
export type X86KeyEventLike = { code: string }

/** The part of a DOM `WheelEvent` this reads. */
export type X86WheelEventLike = { deltaY: number; deltaMode: number }

export const EV_KEY = 0x01
export const EV_REL = 0x02
export const EV_ABS = 0x03
export const ABS_X = 0x00
export const ABS_Y = 0x01
export const REL_WHEEL = 0x08
export const BTN_LEFT = 0x110
export const BTN_RIGHT = 0x111
export const BTN_MIDDLE = 0x112

/** An `EV_KEY` event's value: the key came up, went down, or repeats while held. */
export const KEY_UP = 0
export const KEY_DOWN = 1
export const KEY_REPEAT = 2

/** The tablet's range on both axes, `EVIOCGABS`'s maximum: QEMU's `INPUT_EVENT_ABS_MAX`. */
export const TABLET_AXIS_MAX = 0x7fff

const BUTTON_CODES: Readonly<Record<MouseButton, number>> = {
    left: BTN_LEFT,
    right: BTN_RIGHT,
    middle: BTN_MIDDLE
}

/** `WheelEvent.deltaMode`'s values. */
const DOM_DELTA_LINE = 1
const DOM_DELTA_PAGE = 2
/** About one notch of a mouse wheel, as the browsers that count pixels report it. */
const WHEEL_PIXELS_PER_NOTCH = 100
/** One notch, as the browsers that count lines report it with the usual system setting. */
const WHEEL_LINES_PER_NOTCH = 3
/** The most notches one wheel event turns, so a page-sized delta cannot flood the queue. */
const WHEEL_MAX_NOTCHES = 8

/**
 * How many notches a wheel event turned, negative towards the user, which is the browser's
 * positive `deltaY`. Every event is at least one notch, as QEMU's own window counts each scroll
 * event, so a mouse wheel's tick is one notch whatever distance the browser gives it; a delta of
 * several notches at once, which a browser gives a fast turn, is several.
 */
export function wheelNotches(event: X86WheelEventLike): number {
    if (!Number.isFinite(event.deltaY) || event.deltaY === 0) return 0
    const perNotch =
        event.deltaMode === DOM_DELTA_LINE
            ? WHEEL_LINES_PER_NOTCH
            : event.deltaMode === DOM_DELTA_PAGE
              ? 1
              : WHEEL_PIXELS_PER_NOTCH
    const notches = Math.min(
        WHEEL_MAX_NOTCHES,
        Math.max(1, Math.round(Math.abs(event.deltaY) / perNotch))
    )
    return event.deltaY > 0 ? -notches : notches
}

/**
 * One axis of the tablet, as QEMU scales a window position: the pixel the position is on, clamped
 * to the Screen, `[0, size - 1]`, so a value never reaches 32767.
 *
 * QEMU's front-ends hand the tablet whole pixels of the guest's display, and the conversion a
 * program makes, `(value × size + 32766) ÷ 32767`, gives back exactly that pixel. A position finer
 * than a pixel, kept on a zoomed Screen, would come back as the next pixel for all but the first
 * hundredth of each one, so the brush of a paint program would land beside the pointer.
 */
export function tabletAxis(position: number, size: number): number {
    //QEMU's answer for a window of no size, which a Screen never is
    if (!(size >= 1)) return Math.floor(TABLET_AXIS_MAX / 2)
    const last = Math.ceil(size) - 1
    const pixel = Number.isFinite(position) ? Math.min(last, Math.max(0, Math.floor(position))) : 0
    return Math.floor((pixel * TABLET_AXIS_MAX) / size)
}

export type X86InputOptions = {
    /** Whose size the tablet's range spans; the Screen, asked at every event as the Mouse does. */
    screen: MouseScreen
}

export class X86Input {
    private readonly screen: MouseScreen
    private sink: X86InputSink | null = null
    /** The Linux codes of the keys the sink has seen go down and not come up. */
    private readonly keys = new Set<number>()
    private readonly buttons = new Set<number>()
    /** The axes as last reported, null until the first move: a new reader of reports has none. */
    private x: number | null = null
    private y: number | null = null

    constructor(options: X86InputOptions) {
        this.screen = options.screen
    }

    /**
     * Where reports go from now on, or nowhere with null. A new sink has seen nothing, so what was
     * held and where the pointer was are forgotten.
     *
     * The x86 adapter's calls the Core's `sendInputReport(device, events)` once the program has
     * started, and never during a Testcase; the clear path calls `reset()` with the Keyboard's and
     * the Mouse's.
     */
    setSink(sink: X86InputSink | null): void {
        this.sink = sink
        this.reset()
    }

    // ------------------------------------------------------------ keyboard

    /** A key went down, or the browser repeats it. A key Linux has no code for sends nothing. */
    keyDown(event: X86KeyEventLike): void {
        const code = linuxKeyCode(event.code)
        if (code === undefined || !this.sink) return
        const value = this.keys.has(code) ? KEY_REPEAT : KEY_DOWN
        this.keys.add(code)
        this.send('keyboard', [{ type: EV_KEY, code, value }])
    }

    /** A key came up; one the sink never saw go down sends nothing. */
    keyUp(event: X86KeyEventLike): void {
        const code = linuxKeyCode(event.code)
        if (code === undefined || !this.keys.delete(code)) return
        this.send('keyboard', [{ type: EV_KEY, code, value: KEY_UP }])
    }

    // ------------------------------------------------------------- pointer

    /** The pointer moved, in logical Screen pixels. A move within one pixel is none. */
    moveTo(x: number, y: number): void {
        if (!this.sink) return
        const { width, height } = this.screen.getSize()
        const nextX = tabletAxis(x, width)
        const nextY = tabletAxis(y, height)
        const events: X86InputEvent[] = []
        if (nextX !== this.x) events.push({ type: EV_ABS, code: ABS_X, value: nextX })
        if (nextY !== this.y) events.push({ type: EV_ABS, code: ABS_Y, value: nextY })
        this.x = nextX
        this.y = nextY
        if (events.length > 0) this.send('tablet', events)
    }

    /** A button went down, at the given position or where the pointer already is. */
    buttonDown(button: MouseButton, x?: number, y?: number): void {
        if (!this.sink) return
        if (x !== undefined && y !== undefined) this.moveTo(x, y)
        const code = BUTTON_CODES[button]
        if (this.buttons.has(code)) return
        this.buttons.add(code)
        this.send('tablet', [{ type: EV_KEY, code, value: KEY_DOWN }])
    }

    /** A button came up, at the given position or where the pointer already is. */
    buttonUp(button: MouseButton, x?: number, y?: number): void {
        if (!this.sink) return
        if (x !== undefined && y !== undefined) this.moveTo(x, y)
        const code = BUTTON_CODES[button]
        if (!this.buttons.delete(code)) return
        this.send('tablet', [{ type: EV_KEY, code, value: KEY_UP }])
    }

    /** The wheel turned: one report of `REL_WHEEL` ±1 for each notch, see `wheelNotches`. */
    wheel(event: X86WheelEventLike): void {
        if (!this.sink) return
        const notches = wheelNotches(event)
        const value = Math.sign(notches)
        for (let i = 0; i < Math.abs(notches); i++)
            this.send('tablet', [{ type: EV_REL, code: REL_WHEEL, value }])
    }

    // ---------------------------------------------------------------- loss

    /**
     * Lifts every held key and button, each with its own up event, for the loss of focus: a release
     * the Screen never receives must not leave anything held for the program (ADR 0008), and
     * QEMU's window does the same.
     */
    releaseAll(): void {
        for (const code of [...this.keys]) {
            this.keys.delete(code)
            this.send('keyboard', [{ type: EV_KEY, code, value: KEY_UP }])
        }
        for (const code of [...this.buttons]) {
            this.buttons.delete(code)
            this.send('tablet', [{ type: EV_KEY, code, value: KEY_UP }])
        }
    }

    /** Forgets what is held and where the pointer is, sending nothing: the clear path's half. */
    reset(): void {
        this.keys.clear()
        this.buttons.clear()
        this.x = null
        this.y = null
    }

    private send(device: X86InputDeviceId, events: X86InputEvent[]): void {
        this.sink?.(device, events)
    }
}
