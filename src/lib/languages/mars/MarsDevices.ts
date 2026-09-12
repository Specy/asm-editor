import type { Keyboard } from '$lib/languages/peripherals/Keyboard'
import type { Screen } from '$lib/languages/peripherals/screen/Screen'
import {
    marsDisplayGeometry,
    marsWordAddress,
    type MarsDisplayGeometry,
    type ProjectDisplay
} from './marsDisplay'

/**
 * The MARS and RARS memory-mapped devices: the bitmap display and the keyboard-and-display
 * simulator, driven through the Core's memory observers. MIPS and RISC-V share this module because
 * the two tools are the same tool — RARS's are ports of MARS's — and both Cores expose the same
 * observer API.
 *
 * Plain TypeScript, no runes, so it runs under node in the tests; the adapter owns the lifetime and
 * the Screen, Keyboard and Terminal come in as the peripherals the GUI is already bound to
 * ([ADR 0004](../../../../docs/adr/0004-inject-screens-at-emulator-boundary.md)).
 *
 * Sources: [BitmapDisplay.java](https://raw.githubusercontent.com/dpetersanderson/MARS/main/mars/tools/BitmapDisplay.java),
 * [KeyboardAndDisplaySimulator.java](https://raw.githubusercontent.com/dpetersanderson/MARS/main/mars/tools/KeyboardAndDisplaySimulator.java).
 */

/** MARS's memory map base. The four registers sit in its first four words. */
export const MARS_RECEIVER_CONTROL = 0xffff0000
export const MARS_RECEIVER_DATA = 0xffff0004
export const MARS_TRANSMITTER_CONTROL = 0xffff0008
export const MARS_TRANSMITTER_DATA = 0xffff000c

/** Bit 0 of a control register: the device has a character for the program, or wants one. */
export const MARS_READY_BIT = 0x1
/** Bit 1 of a control register: interrupt-driven I/O, which this editor does not have. */
export const MARS_INTERRUPT_ENABLE_BIT = 0x2

/** ASCII form feed. Stored in the transmitter data register it clears MARS's display window. */
const FORM_FEED = 12

/**
 * How many framebuffer words one bit of the dirty map covers.
 *
 * The grid used to be tracked as a single minimum-to-maximum interval, so a program storing two
 * words at opposite ends of it had the whole grid read back out of the Core and converted, once per
 * flush. Measured in the headless shell on a program written for it — two words a frame on a 256 by
 * 256 word grid, sleeping 16 ms, so it should reach 60 frames a second — that was 29 delivered
 * frames a second with **47% of the wall clock inside the Core's `wasm-bindgen` memory-read glue**,
 * turning 262 144 bytes into a JavaScript array every frame.
 *
 * A block is a kilobyte of Core memory, so a scattered store re-reads 256 words instead of the
 * grid, and a program writing the whole grid still flushes it as one run.
 */
const DIRTY_BLOCK_WORDS = 256

/**
 * How many separate runs of dirty blocks a flush will read before giving up and reading one span
 * from the first to the last. Each run is a call into the Core's memory-read glue, which has a
 * fixed cost per call on top of the words it returns; past a handful of runs the span between them
 * is cheaper to read whole than to reach for piece by piece.
 */
const MAX_DIRTY_RUNS = 8

/**
 * A character the environment's byte cannot hold, the substitution `Z80Device` also makes: the
 * registers are one byte wide and dropping the keystroke would look like a stuck program.
 */
const UNREPRESENTABLE_CHARACTER = '?'.charCodeAt(0)

/** The part of a MARS-derived Core these devices use. Both `JsMips` and `JsRiscV` satisfy it. */
export type MarsCore = {
    readMemoryBytes(address: number, length: number): number[]
    setPeripheralWord(address: number, value: number): void
    addMemoryWriteObserver(
        startAddress: number,
        endAddress: number,
        handler: (address: number, length: number, value: number) => void
    ): number
    addMemoryAccessObserver(
        address: number,
        onRead: ((address: number, value: number) => void) | null,
        onWrite: ((address: number, value: number) => void) | null
    ): number
    removeMemoryObserver(handle: number): void
}

/** What the devices need from the Emulator's peripherals. */
export type MarsDeviceHost = {
    screen: Screen
    keyboard: Keyboard
    /**
     * The Terminal, narrowed to what the transmitter register does to it plus the Input Source,
     * which says whether the run is the user's or a Testcase's.
     */
    terminal: {
        write(text: string): void
        clear(): void
        readonly inputSource: 'interactive' | 'scripted'
    }
}

export class MarsDevices {
    private readonly host: MarsDeviceHost
    private readonly unsubscribeKeyboard: () => void
    private core: MarsCore | null = null
    private handles: number[] = []
    private geometry: MarsDisplayGeometry | null = null
    /**
     * The word grid, mirrored host-side so that a partial re-read can be handed to the Screen at the
     * right offset: `syncFramebuffer` indexes its argument by absolute word index.
     */
    private words = new Int32Array(0)
    /** How many words of the grid the Core will actually let us read, see `probeReadableWords`. */
    private readableWords = 0
    /**
     * Which `DIRTY_BLOCK_WORDS`-sized blocks of the grid have been written since the last flush.
     * `dirtyFrom` and `dirtyTo` are the first and last dirty block, so a flush that finds two of
     * them does not walk the whole map, and -1 when nothing has changed.
     */
    private dirtyBlocks = new Uint8Array(0)
    private dirtyFrom = -1
    private dirtyTo = -1
    /** Whether the receiver data register is holding a character the program has not read yet. */
    private receiverArmed = false
    /** The framebuffer registration, kept apart so a display change can replace only it. */
    private framebufferHandle: number | null = null

    constructor(host: MarsDeviceHost) {
        this.host = host
        //a keystroke arrives between two instructions, so the register is loaded from the queue as
        //soon as one is typed rather than polled: the program sees Ready on its very next `lw`
        this.unsubscribeKeyboard = host.keyboard.onTypedInput(() => this.refillReceiver())
    }

    /** The grid the Screen currently mirrors, for the GUI and the tests. */
    get displayGeometry(): MarsDisplayGeometry | null {
        return this.geometry
    }

    /**
     * Points the devices at a freshly assembled and initialized Core. Registrations live on the
     * Core's memory singleton and survive `assemble()`/`initialize()`, so the previous ones are
     * removed first; a build always starts from a Screen that shows what memory holds.
     */
    attach(core: MarsCore, display: ProjectDisplay): void {
        this.detachCore()
        this.core = core
        this.observeRegisters()
        this.configureDisplay(display)
    }

    /** Drops every registration. The Keyboard subscription outlives it, see `dispose`. */
    detach(): void {
        this.detachCore()
    }

    /** The Emulator is going away: no keystroke may reach a Core that no longer exists. */
    dispose(): void {
        this.detachCore()
        this.unsubscribeKeyboard()
    }

    /**
     * Applies a display the user changed in the Screen panel, immediately and with a re-sync from
     * memory, as MARS does. Safe before a build: it only remembers the geometry.
     */
    setDisplay(display: ProjectDisplay): void {
        this.configureDisplay(display)
    }

    /**
     * Puts the geometry back on a Screen the Emulator's clear path has just reset to its language
     * default, leaving the image blank. The size is the user's configuration rather than something a
     * program asked for, so it survives a Build or a Stop; the picture does not, because it is
     * memory the next build clears.
     */
    resetScreen(display: ProjectDisplay): void {
        this.configureDisplay(display, { sync: false })
    }

    /**
     * Copies the words written since the last call into the Screen. Called at the end of every
     * slice and before a program's `sleep`, rather than once per stored word: a handler call per
     * word costs more than the re-read of the range they touched (phase 7's Core measurements).
     */
    flush(): void {
        if (this.dirtyFrom < 0) return
        const firstBlock = this.dirtyFrom
        const lastBlock = this.dirtyTo
        //the runs are collected before anything is read, so the cap can be applied to all of them
        const runs: number[] = []
        for (let block = firstBlock; block <= lastBlock; block++) {
            if (this.dirtyBlocks[block] === 0) continue
            const start = block
            while (block + 1 <= lastBlock && this.dirtyBlocks[block + 1] !== 0) block++
            runs.push(start, block)
        }
        this.resetDirty()
        if (runs.length === 0) return
        if (runs.length > MAX_DIRTY_RUNS * 2) {
            //too scattered to be worth a call each: one span from the first block to the last, which
            //is what this did for every shape of write before the map existed
            runs.splice(0, runs.length, firstBlock, lastBlock)
        }
        for (let index = 0; index < runs.length; index += 2) {
            const from = runs[index] * DIRTY_BLOCK_WORDS
            //a block past the end of the grid is impossible: the map is sized from the same words
            const to = Math.min(this.words.length, (runs[index + 1] + 1) * DIRTY_BLOCK_WORDS)
            this.readInto(from, to)
            this.host.screen.syncFramebuffer(this.words, from, to)
        }
    }

    /**
     * Reads the whole grid back, the path Undo takes: framebuffer mode journals nothing, so the
     * image comes from the memory the Core has already rolled back
     * ([ADR 0005](../../../../docs/adr/0005-restore-screen-state-on-undo.md)).
     */
    resync(): void {
        this.resetDirty()
        if (!this.core || !this.geometry) return
        this.readInto(0, this.readableWords)
        this.host.screen.syncFramebuffer(this.words, 0, this.readableWords)
    }

    // -------------------------------------------------------------- internals

    private detachCore(): void {
        const core = this.core
        if (core) {
            //only our own handles: the memory singleton is shared by every instance of a Core, so
            //`removeMemoryObservers()` would also unhook another open project's devices
            for (const handle of this.handles) core.removeMemoryObserver(handle)
        }
        this.handles = []
        this.framebufferHandle = null
        this.core = null
        this.readableWords = 0
        this.receiverArmed = false
        this.resetDirty()
    }

    /** Forgets every dirty block, without touching how the map is sized. */
    private resetDirty(): void {
        if (this.dirtyFrom >= 0) this.dirtyBlocks.fill(0, this.dirtyFrom, this.dirtyTo + 1)
        this.dirtyFrom = -1
        this.dirtyTo = -1
    }

    private configureDisplay(display: ProjectDisplay, options = { sync: true }): void {
        const geometry = marsDisplayGeometry(display)
        this.geometry = geometry
        this.words = new Int32Array(geometry.words)
        this.dirtyBlocks = new Uint8Array(Math.ceil(geometry.words / DIRTY_BLOCK_WORDS))
        this.host.screen.useFramebuffer(geometry.columns, geometry.rows)
        this.dirtyFrom = -1
        this.dirtyTo = -1
        const core = this.core
        if (!core) {
            this.readableWords = 0
            return
        }
        this.observeFramebuffer(core, geometry)
        this.readableWords = this.probeReadableWords(core, geometry)
        if (options.sync) this.resync()
    }

    private observeFramebuffer(core: MarsCore, geometry: MarsDisplayGeometry): void {
        if (this.framebufferHandle !== null) {
            core.removeMemoryObserver(this.framebufferHandle)
            this.handles = this.handles.filter((handle) => handle !== this.framebufferHandle)
            this.framebufferHandle = null
        }
        const base = geometry.baseAddress
        const handle = core.addMemoryWriteObserver(base | 0, geometry.endAddress | 0, (address) => {
            //a byte or halfword store reports only the bytes it touched, so the containing word
            //is what gets re-read; `value` is deliberately ignored
            const index = ((address >>> 0) - base) >>> 2
            if (index >= this.words.length) return
            const block = (index / DIRTY_BLOCK_WORDS) | 0
            if (this.dirtyBlocks[block] !== 0) return
            this.dirtyBlocks[block] = 1
            if (this.dirtyFrom < 0 || block < this.dirtyFrom) this.dirtyFrom = block
            if (block > this.dirtyTo) this.dirtyTo = block
        })
        this.framebufferHandle = handle
        this.handles.push(handle)
    }

    private observeRegisters(): void {
        const core = this.core
        if (!core) return
        this.handles.push(
            core.addMemoryAccessObserver(MARS_RECEIVER_CONTROL | 0, null, (_address, value) =>
                this.onControlWrite(MARS_RECEIVER_CONTROL, value, 'receiver')
            ),
            core.addMemoryAccessObserver(
                MARS_RECEIVER_DATA | 0,
                () => this.onReceiverDataRead(),
                null
            ),
            core.addMemoryAccessObserver(MARS_TRANSMITTER_CONTROL | 0, null, (_address, value) =>
                this.onControlWrite(MARS_TRANSMITTER_CONTROL, value, 'transmitter')
            ),
            core.addMemoryAccessObserver(MARS_TRANSMITTER_DATA | 0, null, (_address, value) =>
                this.onTransmitterDataWrite(value)
            )
        )
        //the display is always willing to take a character, so a program polling the Ready bit
        //before its first store finds it set
        core.setPeripheralWord(MARS_TRANSMITTER_CONTROL | 0, MARS_READY_BIT)
        core.setPeripheralWord(MARS_RECEIVER_CONTROL | 0, 0)
        core.setPeripheralWord(MARS_RECEIVER_DATA | 0, 0)
        this.receiverArmed = false
        this.refillReceiver()
    }

    /**
     * Moves one typed character into the receiver data register and sets Ready. Ready means "the
     * queue is not empty", so it survives a read that leaves more input behind; the register holds
     * one character and the Keyboard's queue holds the rest, which is why no keystroke is lost.
     */
    private refillReceiver(): void {
        const core = this.core
        if (!core || this.receiverArmed) return
        //an automated run does not consume live Screen input
        //([ADR 0009](../../../../docs/adr/0009-share-screen-keyboard-input-with-terminal.md)): a
        //keystroke typed into the panel while a Testcase runs stays in the queue, and the register
        //keeps the Ready bit `observeRegisters` cleared when the scripted run built its Core
        if (this.host.terminal.inputSource === 'scripted') return
        const code = this.host.keyboard.readCharacterCode()
        if (code === undefined) {
            core.setPeripheralWord(MARS_RECEIVER_CONTROL | 0, 0)
            return
        }
        core.setPeripheralWord(
            MARS_RECEIVER_DATA | 0,
            code > 0xff ? UNREPRESENTABLE_CHARACTER : code
        )
        core.setPeripheralWord(MARS_RECEIVER_CONTROL | 0, MARS_READY_BIT)
        this.receiverArmed = true
    }

    private onReceiverDataRead(): void {
        //the program was handed the value memory held before this ran, so the register is free again
        this.receiverArmed = false
        this.refillReceiver()
    }

    private onControlWrite(
        register: number,
        value: number,
        device: 'receiver' | 'transmitter'
    ): void {
        if ((value & MARS_INTERRUPT_ENABLE_BIT) !== 0) {
            throw new Error(
                `Interrupt-driven I/O is not supported: the program set the interrupt-enable bit ` +
                    `(bit 1) of the ${device} control register at 0x${register.toString(16)}. ` +
                    `Poll the Ready bit (bit 0) instead.`
            )
        }
        //a program is not the device: whatever it stored, the Ready bit is the device's to state
        const ready =
            register === MARS_TRANSMITTER_CONTROL || this.receiverArmed ? MARS_READY_BIT : 0
        this.core?.setPeripheralWord(register | 0, ready)
    }

    private onTransmitterDataWrite(value: number): void {
        const character = value & 0xff
        if (character === FORM_FEED) {
            this.host.terminal.clear()
            return
        }
        this.host.terminal.write(String.fromCharCode(character))
    }

    /** Fills `words` from Core memory, little-endian, keeping only the low 24 bits MARS colors use. */
    private readInto(from: number, to: number): void {
        const core = this.core
        const geometry = this.geometry
        if (!core || !geometry) return
        const last = Math.min(to, this.readableWords)
        if (last <= from) return
        const bytes = core.readMemoryBytes(
            marsWordAddress(geometry.baseAddress, from) | 0,
            (last - from) * 4
        )
        for (let index = from; index < last; index++) {
            const offset = (index - from) * 4
            this.words[index] =
                ((bytes[offset] ?? 0) & 0xff) |
                (((bytes[offset + 1] ?? 0) & 0xff) << 8) |
                (((bytes[offset + 2] ?? 0) & 0xff) << 16)
        }
    }

    /**
     * How much of the grid the Core will read back. A grid can be configured past the end of a
     * segment — 1024 by 1024 words is four megabytes and every base address but the first runs out
     * before that — and a read past the end throws instead of answering zeroes, so the largest
     * readable prefix is found once per configuration rather than guessed from MARS's constants.
     */
    private probeReadableWords(core: MarsCore, geometry: MarsDisplayGeometry): number {
        const readable = (index: number): boolean => {
            try {
                core.readMemoryBytes(marsWordAddress(geometry.baseAddress, index) | 0, 4)
                return true
            } catch {
                return false
            }
        }
        if (readable(geometry.words - 1)) return geometry.words
        let low = 0
        let high = geometry.words - 1
        while (low < high) {
            const middle = low + Math.ceil((high - low) / 2)
            if (readable(middle)) low = middle
            else high = middle - 1
        }
        return readable(0) ? low + 1 : 0
    }
}
