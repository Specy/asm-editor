import type { MouseButton } from '#lib/languages/peripherals/Mouse.ts'
import {
    TerminalHistory,
    type TerminalPosition
} from '#lib/languages/peripherals/TerminalHistory.ts'
import {
    INPUT_BASE,
    INPUT_BLOCK_SIZE,
    INPUT_BUTTONS,
    INPUT_CODE_MASK,
    INPUT_CONTROL,
    INPUT_COORDINATE_MASK,
    INPUT_EVENT,
    INPUT_ID,
    INPUT_ID_VALUE,
    INPUT_INTERRUPT_ENABLE_BIT,
    INPUT_KEYS,
    INPUT_KEYS_SIZE,
    INPUT_KIND_BUTTON_DOWN,
    INPUT_KIND_BUTTON_UP,
    INPUT_KIND_DROPPED,
    INPUT_KIND_KEY_DOWN,
    INPUT_KIND_KEY_REPEAT,
    INPUT_KIND_KEY_UP,
    INPUT_KIND_MASK,
    INPUT_KIND_SHIFT,
    INPUT_KIND_WHEEL,
    INPUT_POINTER,
    INPUT_QUEUE_DEPTH,
    INPUT_STATUS,
    INPUT_STATUS_MAX,
    INPUT_USAGE_BY_CODE,
    INPUT_WHEEL_MAX,
    INPUT_X_SHIFT,
    INPUT_Y_SHIFT
} from '../inputControllerRegisters'

/**
 * The **Input controller** of MIPS and RISC-V: a memory-mapped device at 0xFFFF0300, right after the
 * Synth, through which a program reads the Keyboard and the Mouse beyond the characters MARS's and
 * RARS's receiver gives ([the design record](../../../../../../docs/design/input-controller.md),
 * [ADR 0071](../../../../../../docs/adr/0071-mips-and-risc-v-read-the-keyboard-and-mouse-through-an-input-controller.md)).
 *
 * It holds what a real controller could: the keys down as a 256-bit map of USB HID usages, the
 * pointer and its buttons in one word, and one queue of 64 one-word event records, key, button and
 * wheel, each with the pointer's position. Everything a program reads is in memory before it reads
 * it: the Cores tell an observer of a read only after the read has its value, so the oldest event
 * sits in the Event register, and the read of it takes it out and puts the next one there. The
 * device's writes are the Core's unjournaled `setPeripheralWord`, so the state stays live across
 * Undo; what Undo does give back is an event a read took, from this device's own journal on the
 * instruction serial ([ADR 0057](../../../../../../docs/adr/0057-restore-the-terminal-on-undo.md)'s
 * rule). The whole block is stated again after every Undo, and after any store into it, a program's
 * or a Poke's, which the device ignores.
 *
 * Its key state is its own, fed by the Keyboard's physical keys with the edge rules of x86's input
 * devices: a key-up for a key not down is ignored, a key going down while down is a repeat and a
 * repeat of a key not down is a key down, and a key with no page-0x07 usage sends nothing.
 *
 * Input reaches it only while the adapter says the program takes input (`accepts`): from its first
 * instruction until it ends, and never in a Testcase. While a bitmap display covers its block the
 * device writes nothing to memory and no read takes an event, so key presses never write pixels;
 * it keeps its state, which it writes whole when it is uncovered.
 *
 * Plain TypeScript, no runes, driven from inside the Core's synchronous execution like the other
 * MARS devices.
 */

/** Where the device writes and what it reads back: the Core, through `MarsDevices`. */
export type InputBus = {
    /** One word of memory, unjournaled and unobserved: the Core's `setPeripheralWord`. */
    push(address: number, value: number): void
    /** One byte as memory holds it, without telling any observer. */
    readByte(address: number): number
}

/** What one instruction's reads took out of the queue, for its Undo to put back. */
type InputRecord = { readonly position: TerminalPosition; readonly popped: number[] }

const BLOCK_WORDS = INPUT_BLOCK_SIZE / 4
const KEY_BYTES = INPUT_KEYS_SIZE

const HELD_BIT: Readonly<Record<MouseButton, number>> = Object.fromEntries(
    INPUT_BUTTONS.map((entry) => [entry.button, entry.held])
) as Record<MouseButton, number>
const BUTTON_CODE: Readonly<Record<MouseButton, number>> = Object.fromEntries(
    INPUT_BUTTONS.map((entry) => [entry.button, entry.code])
) as Record<MouseButton, number>

export class InputController {
    private readonly base: number
    private readonly accepts: () => boolean
    /** The events waiting, oldest first; the first is in the Event register. */
    private readonly queue: number[] = []
    /**
     * How many of the oldest events an Undo put back. They were read once, so a wheel turn never
     * merges into one: a replayed read gives what it gave.
     */
    private replayed = 0
    /** Set while events have been thrown away and no dropped record says so yet. Never journaled. */
    private lost = false
    private readonly keys = new Uint8Array(KEY_BYTES)
    private buttons = 0
    private x = 0
    private y = 0
    private readonly history = new TerminalHistory<InputRecord>()
    private readonly capture = (position: TerminalPosition): InputRecord => ({
        position,
        popped: []
    })
    private bus: InputBus | null = null
    private covered = false

    constructor(options: { accepts: () => boolean; base?: number }) {
        this.accepts = options.accepts
        this.base = options.base ?? INPUT_BASE
    }

    // ------------------------------------------------------------------ lifetime

    /**
     * Points the device at a freshly assembled Core, or at none: a Build, and the start of each
     * Testcase, starts it empty, and states the whole block.
     */
    connect(bus: InputBus | null): void {
        this.bus = bus
        this.reset()
    }

    /**
     * Build, Clear execution and the start of each Testcase: an empty queue, the loss flag clear,
     * nothing held, the pointer at 0,0, and no journal.
     */
    reset(): void {
        this.queue.length = 0
        this.replayed = 0
        this.lost = false
        this.keys.fill(0)
        this.buttons = 0
        this.x = 0
        this.y = 0
        this.history.clear()
        this.restate()
    }

    /**
     * Whether a bitmap display covers the block. Covered, its words are pixels and the device writes
     * none of them; uncovered again, it writes them all, as they are now.
     */
    setCovered(covered: boolean): void {
        if (this.covered === covered) return
        this.covered = covered
        if (!covered) this.restate()
    }

    get isCovered(): boolean {
        return this.covered
    }

    /** Journals the Build about to run, as the Terminal and the Audio do: `position` names the instruction running. */
    track(position: () => TerminalPosition | null, capacity: number): void {
        this.history.track(position, capacity)
    }

    /**
     * Puts back, at the front of the queue and in the order they were read, the events every
     * instruction after `position` took; there is no limit to them, so a queue that comes back can
     * be longer than 64. Then states the whole block.
     */
    undoAfter(position: TerminalPosition): void {
        this.history.undoAfter(position, (record) => {
            for (let i = record.popped.length - 1; i >= 0; i--) {
                this.queue.unshift(record.popped[i])
                this.replayed++
            }
        })
        this.restate()
    }

    /**
     * Writes all 64 bytes as the device has them: the ID, Control 0, Status, the oldest event, the
     * pointer, the reserved words 0 and the key map. After every Undo, which may have rewound a
     * program store into any of them, and whenever the block is uncovered.
     */
    restate(): void {
        if (!this.bus || this.covered) return
        for (let word = 0; word < BLOCK_WORDS; word++) this.push(word * 4, this.wordAt(word * 4))
    }

    // --------------------------------------------------------------- the program

    /** After the program read the Event register: the event it got is taken, and the next takes its place. */
    eventRead(): void {
        if (!this.bus || this.covered) return
        const record = this.queue.shift()
        if (record === undefined) return
        if (this.replayed > 0) this.replayed--
        this.history.current(this.capture)?.popped.push(record)
        this.push(INPUT_EVENT, this.head())
        this.push(INPUT_STATUS, this.status())
    }

    /**
     * After a store into the block, `fromProgram` false for a Poke or another host write: the device
     * states its values again over whatever was stored. A program that set Control's interrupt-enable
     * bit is stopped: MIPS and RISC-V deliver interrupts, from their timers and from the keyboard
     * receiver and display transmitter, but this controller's bit stays reserved until a program
     * needs its interrupts, and asmOS polls it
     * ([asmOS stage 2](../../../../../../docs/design/asmos-stage2.md), decision 5).
     */
    stored(fromProgram: boolean): void {
        if (!this.bus || this.covered) return
        const control = this.bus.readByte(this.base + INPUT_CONTROL)
        this.restate()
        if (fromProgram && (control & INPUT_INTERRUPT_ENABLE_BIT) !== 0) {
            const address = (this.base + INPUT_CONTROL) >>> 0
            throw new Error(
                `The Input controller does not raise interrupts: the program set the interrupt-enable bit ` +
                    `(bit 1) of its control register at 0x${address.toString(16)}, which is reserved. ` +
                    `Poll the Status register instead.`
            )
        }
    }

    // ----------------------------------------------------------------- the keys

    /** A physical key went down, or the browser repeats it. */
    keyDown(code: string): void {
        const usage = INPUT_USAGE_BY_CODE[code]
        if (usage === undefined || !this.accepts()) return
        const held = this.isKeyHeld(usage)
        if (!held) this.setKey(usage, true)
        this.enqueue(held ? INPUT_KIND_KEY_REPEAT : INPUT_KIND_KEY_DOWN, usage)
    }

    /** A physical key came up; one the controller does not hold sends nothing. */
    keyUp(code: string): void {
        const usage = INPUT_USAGE_BY_CODE[code]
        if (usage === undefined || !this.accepts() || !this.isKeyHeld(usage)) return
        this.setKey(usage, false)
        this.enqueue(INPUT_KIND_KEY_UP, usage)
    }

    isKeyHeld(usage: number): boolean {
        return (this.keys[usage >> 3] & (1 << (usage & 7))) !== 0
    }

    // -------------------------------------------------------------- the pointer

    /** The pointer moved to another logical pixel. Position is state: nothing is queued. */
    pointerMoved(x: number, y: number): void {
        if (!this.accepts()) return
        if (this.place(x, y)) this.push(INPUT_POINTER, this.pointer())
    }

    buttonDown(button: MouseButton, x: number, y: number): void {
        this.button(button, true, x, y)
    }

    buttonUp(button: MouseButton, x: number, y: number): void {
        this.button(button, false, x, y)
    }

    /**
     * The wheel turned by `notches`, positive away from the user. A turn merges into the newest
     * event when that is an unread wheel record of the same sign and the sum stays within ±127, so
     * a trackpad's burst does not fill the queue; the record then takes the latest position.
     */
    wheel(notches: number, x: number, y: number): void {
        if (notches === 0 || !this.accepts()) return
        if (this.place(x, y)) this.push(INPUT_POINTER, this.pointer())
        const tail = this.queue.length - 1
        const record = this.queue[tail]
        if (!this.lost && tail >= this.replayed && record !== undefined) {
            if (kindOf(record) === INPUT_KIND_WHEEL) {
                const merged = signedCode(record) + notches
                if (
                    Math.sign(signedCode(record)) === Math.sign(notches) &&
                    Math.abs(merged) <= INPUT_WHEEL_MAX
                ) {
                    this.queue[tail] = this.record(INPUT_KIND_WHEEL, merged)
                    if (tail === 0) this.push(INPUT_EVENT, this.head())
                    return
                }
            }
        }
        this.enqueue(INPUT_KIND_WHEEL, clampWheel(notches))
    }

    // --------------------------------------------------------- what it shows

    /** The events waiting, oldest first, as the Event register would give them. */
    get pending(): readonly number[] {
        return this.queue
    }

    /** Whether events were thrown away since the last dropped record. */
    get eventsLost(): boolean {
        return this.lost
    }

    /** The pointer register: y in bits 30–21, x in bits 20–11, the buttons held in bits 2–0. */
    pointer(): number {
        return (
            ((this.y & INPUT_COORDINATE_MASK) << INPUT_Y_SHIFT) |
            ((this.x & INPUT_COORDINATE_MASK) << INPUT_X_SHIFT) |
            this.buttons
        )
    }

    // ---------------------------------------------------------------- internals

    private button(button: MouseButton, down: boolean, x: number, y: number): void {
        if (!this.accepts()) return
        const moved = this.place(x, y)
        const bit = HELD_BIT[button]
        if (((this.buttons & bit) !== 0) === down) {
            if (moved) this.push(INPUT_POINTER, this.pointer())
            return
        }
        this.buttons = down ? this.buttons | bit : this.buttons & ~bit
        this.push(INPUT_POINTER, this.pointer())
        this.enqueue(down ? INPUT_KIND_BUTTON_DOWN : INPUT_KIND_BUTTON_UP, BUTTON_CODE[button])
    }

    /**
     * Queues an event, after Linux's `SYN_DROPPED`: while the queue is full an event is thrown away
     * and the loss flag set; the next event to arrive with the flag set is preceded by a dropped
     * record, if there is room, which clears the flag. A read never queues anything.
     */
    private enqueue(kind: number, code: number): void {
        if (this.lost) {
            if (this.queue.length >= INPUT_QUEUE_DEPTH) return
            this.append(this.record(INPUT_KIND_DROPPED, 0))
            this.lost = false
        }
        if (this.queue.length >= INPUT_QUEUE_DEPTH) {
            this.lost = true
            return
        }
        this.append(this.record(kind, code))
    }

    private append(record: number): void {
        this.queue.push(record)
        if (this.queue.length === 1) this.push(INPUT_EVENT, record)
        this.push(INPUT_STATUS, this.status())
    }

    /** One event word: the pointer's position, the kind and the code. Bit 31 is always 0. */
    private record(kind: number, code: number): number {
        return (
            ((this.y & INPUT_COORDINATE_MASK) << INPUT_Y_SHIFT) |
            ((this.x & INPUT_COORDINATE_MASK) << INPUT_X_SHIFT) |
            ((kind & INPUT_KIND_MASK) << INPUT_KIND_SHIFT) |
            (code & INPUT_CODE_MASK)
        )
    }

    private setKey(usage: number, down: boolean): void {
        const byte = usage >> 3
        const bit = 1 << (usage & 7)
        this.keys[byte] = down ? this.keys[byte] | bit : this.keys[byte] & ~bit
        const word = INPUT_KEYS + (usage >> 5) * 4
        this.push(word, this.wordAt(word))
    }

    /** Moves the pointer, a logical pixel the Mouse has already clamped; answers whether it moved. */
    private place(x: number, y: number): boolean {
        const nextX = coordinate(x)
        const nextY = coordinate(y)
        if (nextX === this.x && nextY === this.y) return false
        this.x = nextX
        this.y = nextY
        return true
    }

    private head(): number {
        return this.queue[0] ?? 0
    }

    private status(): number {
        return Math.min(this.queue.length, INPUT_STATUS_MAX)
    }

    /** The word at `offset` as the device states it. */
    private wordAt(offset: number): number {
        if (offset === INPUT_ID) return INPUT_ID_VALUE
        if (offset === INPUT_STATUS) return this.status()
        if (offset === INPUT_EVENT) return this.head()
        if (offset === INPUT_POINTER) return this.pointer()
        if (offset >= INPUT_KEYS && offset < INPUT_KEYS + KEY_BYTES) {
            const at = offset - INPUT_KEYS
            return (
                this.keys[at] |
                (this.keys[at + 1] << 8) |
                (this.keys[at + 2] << 16) |
                (this.keys[at + 3] << 24)
            )
        }
        //Control reads 0, and so do the reserved words
        return 0
    }

    private push(offset: number, value: number): void {
        if (!this.bus || this.covered) return
        this.bus.push((this.base + offset) | 0, value | 0)
    }
}

function kindOf(record: number): number {
    return (record >>> INPUT_KIND_SHIFT) & INPUT_KIND_MASK
}

/** A wheel record's code as the signed byte it is. */
function signedCode(record: number): number {
    return ((record & INPUT_CODE_MASK) << 24) >> 24
}

function clampWheel(notches: number): number {
    return Math.max(-INPUT_WHEEL_MAX, Math.min(INPUT_WHEEL_MAX, Math.trunc(notches)))
}

function coordinate(value: number): number {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.min(INPUT_COORDINATE_MASK, Math.floor(value)))
}
