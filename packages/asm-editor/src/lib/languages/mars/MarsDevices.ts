import type { Audio } from '#lib/languages/peripherals/audio/Audio.ts'
import type { SynthBus } from '#lib/languages/peripherals/audio/Synth.ts'
import type { Keyboard } from '#lib/languages/peripherals/Keyboard.ts'
import type { Mouse } from '#lib/languages/peripherals/Mouse.ts'
import type { Screen } from '#lib/languages/peripherals/screen/Screen.ts'
import type { Terminal } from '#lib/languages/peripherals/Terminal.svelte.ts'
import { partitionPoint } from '#lib/sorted.ts'
import {
    marsDisplayGeometry,
    marsWordAddress,
    type MarsDisplayGeometry,
    type ProjectDisplay
} from './marsDisplay'
import { SYNTH_BASES, SYNTH_BLOCK_SIZE } from '../synthRegisters'
import { INPUT_BASE, INPUT_BLOCK_SIZE, INPUT_EVENT } from '../inputControllerRegisters'
import { MIDI_PORT_BASE, MIDI_PORT_BLOCK_SIZE, MIDI_PORT_STATUS } from '../midiPortRegisters'
import { PCM_BASE, PCM_BLOCK_SIZE, PCM_FREE } from '../sampledAudioRegisters'
import { InputController } from './InputController'
import { MidiPortDevice } from './MidiPortDevice'
import { SampledAudioDevice } from './SampledAudioDevice'
import type { SoundBus, SoundClock } from './soundDevice'

/**
 * The MARS and RARS memory-mapped devices: the bitmap display, the keyboard-and-display simulator,
 * and the **Synth**, the **Input controller**, the **MIDI port** and the **Sampled-audio output**
 * this project adds beside them, driven through the Core's memory observers, and the display
 * through the Core's map of written blocks. MIPS and
 * RISC-V share this module because the two tools are the same tool — RARS's are ports of MARS's —
 * and both Cores expose the same API.
 *
 * Plain TypeScript, no runes, so it runs under node in the tests; the adapter owns the lifetime and
 * the Screen, Keyboard and Terminal come in as the peripherals the GUI is already bound to
 * ([ADR 0004](../../../../../../docs/adr/0004-inject-screens-at-emulator-boundary.md)).
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
/**
 * Bit 1 of a control register: the device requests interrupts. The receiver requests one for as
 * long as a character waits; the transmitter one each time it becomes Ready again after taking a
 * character, as MARS's does, so setting the bit asks for nothing by itself.
 */
export const MARS_INTERRUPT_ENABLE_BIT = 0x2

/**
 * What each device's interrupt carries: MARS's codes, which put Cause's pending bit 8 (keyboard) or
 * 9 (display) on MIPS, and the value a RISC-V handler finds in `utval`, as RARS gives them.
 */
export const MARS_RECEIVER_INTERRUPT = 0x40
export const MARS_TRANSMITTER_INTERRUPT = 0x80

/**
 * RARS's Timer Tool registers, which the RISC-V Core keeps: `time` at 0xFFFF0018 and `timecmp` at
 * 0xFFFF0020, 64 bits each ([ADR 0074](../../../../../../docs/adr/0074-mips-and-risc-v-timers-count-what-their-references-count.md)).
 */
export const RARS_TIME = 0xffff0018
export const RARS_TIMECMP = 0xffff0020
export const RARS_TIMER_SIZE = 0x10

/** ASCII form feed. Stored in the transmitter data register it clears MARS's display window. */
const FORM_FEED = 12

/**
 * How many framebuffer words one block of the Core's written-blocks map covers: the Cores note
 * writes a kilobyte at a time (`trackWrites`), counted from the grid's first word.
 *
 * The Core used to call an observer of the grid on every store, which was 55 to 65% of the Core's
 * time while a program drew ([asmOS stage 2](../../../../../../docs/design/asmos-stage2.md),
 * decision 2). Now the Core marks the block a store lands in, and a flush reads the map once and
 * fetches only those blocks, so a scattered store re-reads 256 words instead of the grid, and a
 * program writing the whole grid still flushes it as one run.
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
    readMemoryWords(address: number, count: number): ArrayLike<number>
    trackWrites(start: number, end: number): void
    takeWrittenBlocks(): ArrayLike<number>
    setPeripheralWord(address: number, value: number): void
    /** Raises a device's level-triggered interrupt line, `MARS_RECEIVER_INTERRUPT` for example. */
    raiseExternalInterrupt(code: number): void
    /** Clears a device's line, and withdraws its pulse that no interrupt has taken yet. */
    clearExternalInterrupt(code: number): void
    /**
     * One interrupt request from a device, edge-triggered: pending until an interrupt takes it,
     * then spent, and part of the Undo history, which the Core journals.
     */
    pulseExternalInterrupt(code: number): void
    /** RISC-V's: switches the Timer Tool's registers off while a display covers them. */
    setTimerEnabled?(enabled: boolean): void
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
     * The Terminal, narrowed to what the two registers need of it: the transmitter writes to and
     * clears its output, and the receiver reads its keystrokes through it, which is how a Testcase's
     * scripted input reaches the receiver as it reaches EASy68K's task 7 and the Z80's key port.
     */
    terminal: Pick<
        Terminal,
        'write' | 'clearOutput' | 'peekKeystroke' | 'takeKeystroke' | 'onInputChange'
    >
    /**
     * The Audio whose Synth the block at 0xFFFF0100 drives, read at each store since a Testcase
     * swaps in a silent one; without it the block is plain memory.
     */
    audio?: () => Audio
    /** The Mouse whose pointer, buttons and wheel the Input controller reports. */
    mouse?: Mouse
    /**
     * Whether the program takes the Screen's input now: from its first instruction until it ends,
     * and never in a Testcase ([the design record](../../../../../../docs/design/input-controller.md),
     * decision 13). Without it the Input controller hears nothing.
     */
    inputOpen?: () => boolean
    /** Whether the Core has RARS's Timer Tool registers at 0xFFFF0018, which RISC-V's does. */
    timer?: () => boolean
    /**
     * Program time, which the MIDI port and the sampled-audio output drain on, read at each use
     * since a Testcase swaps in a virtual clock; without it, or without `audio`, their blocks are
     * plain memory.
     */
    clock?: () => SoundClock
}

/** The Synth's block, the same on MARS and RARS. */
const SYNTH_BASE = SYNTH_BASES.mips

/**
 * Which devices last attached to each Core package's memory. Every `JsMips`, and every `JsRiscV`,
 * shares one memory, one list of observers and one written-blocks map, so an Emulator that was never
 * disposed still hears the accesses of the program another one runs; the Input controller answers,
 * and the display tracks and takes written blocks, only for the devices that own the memory now, or
 * a stale one would state its own registers over the live ones, take blocks the live display needs,
 * or move the tracked range off it. Keyed by the Core's prototype, which is the package's class.
 */
const memoryOwners = new WeakMap<object, MarsDevices>()
/** How much an upload's source read is split into when the whole of it cannot be read. */
const READ_CHUNK = 4096

export class MarsDevices {
    private readonly host: MarsDeviceHost
    private readonly unsubscribeInput: () => void
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
     * Whether the receiver data register is presenting a keystroke the program has not read yet. The
     * keystroke stays in its queue until the program reads the register: a register that took it
     * out would take it from a read syscall waiting on the same queue.
     */
    private receiverArmed = false
    /** Set while the Core rewinds, whose restoring stores are not the program's writes. */
    private rewinding = false
    /**
     * The interrupt-enable bits of the receiver's and the transmitter's control registers, as the
     * program last stored them ([asmOS stage 2](../../../../../../docs/design/asmos-stage2.md),
     * decision 12). The receiver's request is level-triggered: raised for as long as the bit is set
     * and a character waits, so every key, one typed before the bit was set or a Testcase's
     * included, reaches the handler. The transmitter's is edge-triggered, as MARS's is: one request
     * each time it becomes Ready again after a character, which here is at once, since the console
     * is always ready. Setting the bit asks for nothing, and a handler that prints nothing more is
     * not called again; asking for as long as the bit was set re-entered such a handler for ever.
     */
    private receiverInterrupts = false
    private transmitterInterrupts = false
    /** Told when a device requests an interrupt, which ends a RISC-V `wfi`. */
    private readonly interruptListeners = new Set<() => void>()
    /** Whether the display covers RARS's timer registers, which are then pixels. */
    private timerCovered = false
    /**
     * Whether the bitmap display covers the Synth's block, as it does at MARS's "memory map" base,
     * 0xffff0000: its words are then pixels, and the Synth is off rather than played by drawing.
     */
    private synthCovered = false
    /** Set while the host writes memory, a Poke's bytes, which are no store of the program's. */
    private hostWriting = false
    /**
     * The keys, the pointer and the wheel as a MIPS or RISC-V program reads them, at 0xFFFF0300
     * ([ADR 0071](../../../../../../docs/adr/0071-mips-and-risc-v-read-the-keyboard-and-mouse-through-an-input-controller.md)).
     */
    readonly input: InputController
    /**
     * MIDI bytes and streamed samples, at 0xFFFF0340 and 0xFFFF0350
     * ([ADR 0075](../../../../../../docs/adr/0075-mips-and-risc-v-get-a-midi-port-and-a-sampled-audio-output.md)),
     * when the host has an Audio and a clock for them.
     */
    readonly midi: MidiPortDevice | null = null
    readonly pcm: SampledAudioDevice | null = null

    constructor(host: MarsDeviceHost) {
        this.host = host
        this.input = new InputController({ accepts: () => host.inputOpen?.() ?? false })
        const { audio, clock } = host
        if (audio && clock) {
            this.midi = new MidiPortDevice({ audio, clock })
            this.pcm = new SampledAudioDevice({ audio, clock })
        }
        //a keystroke arrives between two instructions, so the register is loaded as soon as one is
        //typed rather than polled: the program sees Ready on its very next `lw`. The Terminal says
        //when its own input changes, a Testcase's scripted lines included
        const unsubscribers = [
            host.keyboard.onTypedInput(() => this.refreshReceiver()),
            host.terminal.onInputChange(() => this.refreshReceiver()),
            //every key on the Screen feeds the receiver's typed characters and the Input
            //controller's keys alike, and the program picks its channel (decision 5)
            host.keyboard.onPhysicalKey((code, down) =>
                down ? this.input.keyDown(code) : this.input.keyUp(code)
            )
        ]
        const mouse = host.mouse
        if (mouse)
            unsubscribers.push(
                mouse.onMouseEvent((event, button) => {
                    if (event === 'move') this.input.pointerMoved(mouse.x, mouse.y)
                    else if (button && event === 'down')
                        this.input.buttonDown(button, mouse.x, mouse.y)
                    else if (button) this.input.buttonUp(button, mouse.x, mouse.y)
                }),
                mouse.onWheel((notches) => this.input.wheel(notches, mouse.x, mouse.y))
            )
        this.unsubscribeInput = () => unsubscribers.forEach((unsubscribe) => unsubscribe())
    }

    regions(): import('../commonLanguageFeatures.svelte').DeviceRegion[] {
        const regions = [{ name: 'MMIO', start: 0xffff0000n, end: 0xffff0010n }]
        if (this.host.timer?.() && !this.timerCovered)
            regions.push({
                name: 'Timer',
                start: BigInt(RARS_TIME),
                end: BigInt(RARS_TIME + RARS_TIMER_SIZE)
            })
        if (this.host.audio && !this.synthCovered)
            regions.push({
                name: 'Synth',
                start: BigInt(SYNTH_BASE),
                end: BigInt(SYNTH_BASE + SYNTH_BLOCK_SIZE)
            })
        if (!this.input.isCovered)
            regions.push({
                name: 'Input controller',
                start: BigInt(INPUT_BASE),
                end: BigInt(INPUT_BASE + INPUT_BLOCK_SIZE)
            })
        if (this.midi && !this.midi.isCovered)
            regions.push({
                name: 'MIDI port',
                start: BigInt(MIDI_PORT_BASE),
                end: BigInt(MIDI_PORT_BASE + MIDI_PORT_BLOCK_SIZE)
            })
        if (this.pcm && !this.pcm.isCovered)
            regions.push({
                name: 'Sampled-audio output',
                start: BigInt(PCM_BASE),
                end: BigInt(PCM_BASE + PCM_BLOCK_SIZE)
            })
        if (this.geometry)
            regions.push({
                name: 'Bitmap display',
                start: BigInt(this.geometry.baseAddress),
                end: BigInt(this.geometry.endAddress + 4)
            })
        return regions
    }

    /**
     * Points the devices at a freshly assembled and initialized Core. Registrations live on the
     * Core's memory singleton and survive `assemble()`/`initialize()`, so the previous ones are
     * removed first; a build always starts from a Screen that shows what memory holds.
     */
    attach(core: MarsCore, display: ProjectDisplay): void {
        this.detachCore()
        this.core = core
        memoryOwners.set(memoryOf(core), this)
        this.observeRegisters()
        this.configureDisplay(display)
        //once the display has said whether it covers the block, so a covered one gets no words
        this.input.connect({
            push: (address, value) => {
                if (this.ownsMemory(core)) core.setPeripheralWord(address, value)
            },
            readByte: (address) => (core.readMemoryBytes(address | 0, 1)[0] ?? 0) & 0xff
        })
        const sound: SoundBus = {
            push: (address, value) => {
                if (this.ownsMemory(core)) core.setPeripheralWord(address, value)
            },
            readWord: (address) => core.readMemoryWords(address | 0, 1)[0] ?? 0
        }
        this.midi?.connect(sound)
        this.pcm?.connect(sound)
    }

    /** Clear execution: the Input controller starts empty again, as at a Build. */
    resetInput(): void {
        this.input.reset()
    }

    // -------------------------------------------------------------- the sound devices

    /** Journals the Build about to run for the sound devices, as for the Terminal. */
    trackSound(position: () => bigint | null, capacity: number): void {
        this.midi?.track(position, capacity)
        this.pcm?.track(position, capacity)
    }

    /** Undo: the sound devices take back what every instruction after `position` did to them. */
    undoSoundAfter(position: bigint): void {
        this.midi?.undoAfter(position)
        this.pcm?.undoAfter(position)
    }

    /** After an Undo of a Poke, which may have rewound a store into their blocks: their words again. */
    restateSound(): void {
        this.midi?.restate()
        this.pcm?.restate()
    }

    /** Clear execution: the sound devices start empty again, as at a Build. */
    resetSound(): void {
        this.midi?.reset()
        this.pcm?.reset()
    }

    /**
     * Brings the MIDI port's Status and the sampled-audio output's Free up to date with Program
     * time, which went on while no instruction ran: before every run call and after every wait. A
     * read is told to its observer only after it has its value, so this is what a program polling
     * once a frame reads.
     */
    refreshSound(): void {
        this.midi?.refresh()
        this.pcm?.refresh()
    }

    /**
     * Runs a host write to memory, a Poke's or a Testcase's starting memory, which the Core makes
     * as a program store, so the observers hear it: the Input controller re-states its words over
     * it, as it does for a program store, but never takes it for the program's interrupt request.
     */
    hostWrite<T>(write: () => T): T {
        this.hostWriting = true
        try {
            return write()
        } finally {
            this.hostWriting = false
        }
    }

    /** The Emulator is going away: no keystroke may reach a Core that no longer exists. */
    dispose(): void {
        this.detachCore()
        this.unsubscribeInput()
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
     * Copies the blocks written since the last call into the Screen: the program's stores, a Poke's,
     * and an Undo's restores, which the Core marks alike. Called at the end of every slice, before a
     * program's `sleep` or a wait for input, and after an Undo or a Poke, which so redraw only what
     * they changed. The samples the sampled-audio output took since go to the Audio then too.
     */
    flush(): void {
        //the samples written since the last flush go out with the frame
        this.pcm?.flush()
        const core = this.core
        if (!core || !this.geometry || !this.ownsMemory(core)) return
        const blocks = core.takeWrittenBlocks()
        if (blocks.length === 0) return
        //the runs are collected before anything is read, so the cap can be applied to all of them;
        //the Core gives the blocks in ascending order
        const runs: number[] = []
        for (let index = 0; index < blocks.length; index++) {
            const start = blocks[index]
            while (index + 1 < blocks.length && blocks[index + 1] === blocks[index] + 1) index++
            runs.push(start, blocks[index])
        }
        if (runs.length > MAX_DIRTY_RUNS * 2) {
            //too scattered to be worth a call each: one span from the first block to the last
            runs.splice(0, runs.length, runs[0], runs[runs.length - 1])
        }
        for (let index = 0; index < runs.length; index += 2) {
            const from = runs[index] * DIRTY_BLOCK_WORDS
            //the map covers the grid and nothing past it, but its last block may be partly beyond
            const to = Math.min(this.words.length, (runs[index + 1] + 1) * DIRTY_BLOCK_WORDS)
            this.readInto(from, to)
            this.host.screen.syncFramebuffer(this.words, from, to)
        }
    }

    /**
     * Runs the Core's `undo`, whose restoring stores reach the observers as ordinary writes: the
     * Synth must not take them for the program's, an upload's start register least of all, and the
     * transmitter must not print them, a form feed least of all, which would clear the output. Undo
     * re-reads the Synth's block afterwards instead, with `readSynthBlock`, and rewinds the Terminal
     * through its own history ([ADR 0057](../../../../../../docs/adr/0057-restore-the-terminal-on-undo.md)).
     */
    rewind(undo: () => void): void {
        this.rewinding = true
        try {
            undo()
        } finally {
            this.rewinding = false
        }
    }

    /**
     * After an Undo, once the Terminal has put back what it journaled: the receiver shows what is
     * waiting now and states its line again, which the Core's Undo leaves alone, since it is the
     * device's and not the program's. The transmitter's requests are pulses, which the Core's Undo
     * puts back itself.
     */
    afterUndo(): void {
        this.refreshReceiver()
    }

    /** Whether the program turned the receiver's interrupt on, bit 1 of its control register. */
    get receiverInterruptsEnabled(): boolean {
        return this.receiverInterrupts
    }

    /** Calls `listener` each time a device requests an interrupt, until the returned function is called. */
    onInterruptRequest(listener: () => void): () => void {
        this.interruptListeners.add(listener)
        return () => this.interruptListeners.delete(listener)
    }

    /** The Synth's 512 bytes as memory holds them, for the Undo that has just rewound them. */
    readSynthBlock(): ArrayLike<number> {
        return this.core ? readBytes(this.core, SYNTH_BASE, SYNTH_BLOCK_SIZE) : []
    }

    /**
     * Reads the whole grid back, for a display that has just been configured. What was written
     * before is read with it, so the blocks waiting in the map are dropped.
     */
    resync(): void {
        const core = this.core
        if (!core || !this.geometry) return
        if (this.ownsMemory(core)) core.takeWrittenBlocks()
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
            if (this.ownsMemory(core)) {
                //and the map only if it is ours, which stops the Core noting stores for nobody
                core.trackWrites(0, 0)
                memoryOwners.delete(memoryOf(core))
            }
        }
        this.handles = []
        this.core = null
        this.readableWords = 0
        this.receiverArmed = false
        this.receiverInterrupts = false
        this.transmitterInterrupts = false
        this.input.connect(null)
        this.midi?.connect(null)
        this.pcm?.connect(null)
    }

    private configureDisplay(display: ProjectDisplay, options = { sync: true }): void {
        const geometry = marsDisplayGeometry(display)
        this.geometry = geometry
        this.synthCovered = covers(geometry, SYNTH_BASE, SYNTH_BLOCK_SIZE)
        //switching the display can switch the controller on or off mid-run: on, it states its block
        this.input.setCovered(covers(geometry, INPUT_BASE, INPUT_BLOCK_SIZE))
        //and RARS's timer, which the Core keeps: its words are pixels while the display covers them
        this.timerCovered = !!this.host.timer?.() && covers(geometry, RARS_TIME, RARS_TIMER_SIZE)
        this.midi?.setCovered(covers(geometry, MIDI_PORT_BASE, MIDI_PORT_BLOCK_SIZE))
        this.pcm?.setCovered(covers(geometry, PCM_BASE, PCM_BLOCK_SIZE))
        this.words = new Int32Array(geometry.words)
        this.host.screen.useFramebuffer(geometry.columns, geometry.rows)
        const core = this.core
        if (!core) {
            this.readableWords = 0
            return
        }
        //the Core notes which blocks of the grid stores write, from its first word; a stale
        //Emulator's display change must not move the range off the live one's
        if (this.ownsMemory(core)) {
            core.trackWrites(geometry.baseAddress | 0, (geometry.endAddress + 4) | 0)
            core.setTimerEnabled?.(!this.timerCovered)
        }
        this.readableWords = this.probeReadableWords(core, geometry)
        if (options.sync) this.resync()
    }

    private observeRegisters(): void {
        const core = this.core
        if (!core) return
        this.handles.push(
            core.addMemoryAccessObserver(MARS_RECEIVER_CONTROL | 0, null, (_address, value) =>
                this.onControlWrite(MARS_RECEIVER_CONTROL, value)
            ),
            core.addMemoryAccessObserver(
                MARS_RECEIVER_DATA | 0,
                () => this.onReceiverDataRead(),
                null
            ),
            core.addMemoryAccessObserver(MARS_TRANSMITTER_CONTROL | 0, null, (_address, value) =>
                this.onControlWrite(MARS_TRANSMITTER_CONTROL, value)
            ),
            core.addMemoryAccessObserver(MARS_TRANSMITTER_DATA | 0, null, (_address, value) =>
                this.onTransmitterDataWrite(value)
            )
        )
        this.observeExtensions(core)
        //the display is always willing to take a character, so a program polling the Ready bit
        //before its first store finds it set
        core.setPeripheralWord(MARS_TRANSMITTER_CONTROL | 0, MARS_READY_BIT)
        core.setPeripheralWord(MARS_RECEIVER_CONTROL | 0, 0)
        core.setPeripheralWord(MARS_RECEIVER_DATA | 0, 0)
        this.receiverArmed = false
        this.receiverInterrupts = false
        this.transmitterInterrupts = false
        this.refreshReceiver()
    }

    /**
     * Shows the next keystroke in the receiver data register and sets Ready, or clears Ready when
     * there is none. Ready means "a keystroke is waiting", so it survives a read that leaves more
     * input behind, and no keystroke is lost: the register only shows the next one, which stays
     * queued until the program reads it.
     *
     * The keystroke comes through the Terminal: a Testcase's scripted lines, a byte at a time, and
     * otherwise what is typed on the Screen panel or in the Terminal. An automated run does not
     * consume live Screen input
     * ([ADR 0009](../../../../../../docs/adr/0009-share-screen-keyboard-input-with-terminal.md)), so a
     * keystroke typed into the panel while a Testcase runs stays in the queue for the run after it.
     */
    private refreshReceiver(): void {
        const core = this.core
        if (!core) return
        const code = this.host.terminal.peekKeystroke(this.host.keyboard)
        if (code === undefined) {
            this.receiverArmed = false
            core.setPeripheralWord(MARS_RECEIVER_CONTROL | 0, this.receiverControl())
            this.updateInterrupts()
            return
        }
        core.setPeripheralWord(
            MARS_RECEIVER_DATA | 0,
            code > 0xff ? UNREPRESENTABLE_CHARACTER : code
        )
        this.receiverArmed = true
        core.setPeripheralWord(MARS_RECEIVER_CONTROL | 0, this.receiverControl())
        this.updateInterrupts()
    }

    /** The receiver's control word: Ready while a keystroke waits, and the program's enable bit. */
    private receiverControl(): number {
        return (
            (this.receiverArmed ? MARS_READY_BIT : 0) |
            (this.receiverInterrupts ? MARS_INTERRUPT_ENABLE_BIT : 0)
        )
    }

    /**
     * States the receiver's interrupt request to the Core: its line is raised while its enable bit
     * is set and a character waits, and cleared otherwise, so a request withdrawn by a read of the
     * data register, a write of the control register or an Undo is withdrawn at once. The
     * transmitter's requests are pulses, sent as it takes each character (`onTransmitterDataWrite`).
     * Only the devices that own the Core's memory do, as with the Input controller: a stale
     * Emulator's receiver must not raise the live program's interrupt.
     */
    private updateInterrupts(): void {
        const core = this.core
        if (!core || !this.ownsMemory(core)) return
        const receiver = this.receiverInterrupts && this.receiverArmed
        if (receiver) core.raiseExternalInterrupt(MARS_RECEIVER_INTERRUPT)
        else core.clearExternalInterrupt(MARS_RECEIVER_INTERRUPT)
        if (receiver) this.tellInterruptListeners()
    }

    private tellInterruptListeners(): void {
        for (const listener of [...this.interruptListeners]) listener()
    }

    /**
     * The blocks this editor adds, the Synth's, the Input controller's, the MIDI port's and the
     * sampled-audio output's, which sit back to back from 0xFFFF0100, watched for stores by one
     * range observer: the Core checks every observer on every memory access, an instruction fetch
     * included, so each one costs a little on every instruction of every program.
     *
     * Every store into the Synth's block reaches the Synth as it happens, inside the storing
     * instruction, so that an upload copies before the program's next instruction can change its
     * source, and a gate pulsed off and on within a slice still retriggers. A store into the Input
     * controller's block is ignored, and the device states its words again. A store into the sound
     * devices' blocks sends a MIDI byte, queues samples or changes a setting, and the device states
     * its words again. The reads that change what a device answers next need observers of their own,
     * the ones the Core has for reads: the Event register's, which takes an event, and the MIDI
     * port's Status and the output's Free, whose reads in a Testcase can move the virtual clock.
     */
    private observeExtensions(core: MarsCore): void {
        const audio = this.host.audio
        const start = audio ? SYNTH_BASE : INPUT_BASE
        const end = this.midi ? PCM_BASE + PCM_BLOCK_SIZE : INPUT_BASE + INPUT_BLOCK_SIZE
        const synthBus: SynthBus = {
            littleEndian: true,
            read: (address, length) => readBytes(core, address, length)
        }
        this.handles.push(
            core.addMemoryWriteObserver(start | 0, (end - 4) | 0, (address, length, value) => {
                //Undo's restoring stores are not the program's: the devices state their whole
                //blocks once the Core has rewound, and the Synth reads its block back
                if (this.rewinding) return
                const at = address >>> 0
                if (at >= INPUT_BASE) {
                    if (!this.ownsMemory(core)) return
                    if (at < INPUT_BASE + INPUT_BLOCK_SIZE) this.input.stored(!this.hostWriting)
                    if (at + length > MIDI_PORT_BASE) {
                        this.midi?.stored(at, length, value, !this.hostWriting)
                        this.pcm?.stored(at, length, value, !this.hostWriting)
                    }
                    return
                }
                if (!audio || this.synthCovered) return
                audio().synth.store(at - SYNTH_BASE, length, value, synthBus)
            }),
            core.addMemoryAccessObserver(
                (INPUT_BASE + INPUT_EVENT) | 0,
                () => {
                    if (this.ownsMemory(core)) this.input.eventRead()
                },
                null
            )
        )
        const midi = this.midi
        const pcm = this.pcm
        if (midi && pcm)
            this.handles.push(
                core.addMemoryAccessObserver(
                    (MIDI_PORT_BASE + MIDI_PORT_STATUS) | 0,
                    () => {
                        if (this.ownsMemory(core)) midi.statusRead()
                    },
                    null
                ),
                core.addMemoryAccessObserver(
                    (PCM_BASE + PCM_FREE) | 0,
                    () => {
                        if (this.ownsMemory(core)) pcm.freeRead()
                    },
                    null
                )
            )
    }

    private onReceiverDataRead(): void {
        //the program was handed the value memory held before this ran: the keystroke the register
        //was showing is read, and the next one takes its place
        if (this.receiverArmed) this.host.terminal.takeKeystroke(this.host.keyboard)
        this.refreshReceiver()
    }

    /**
     * A store into a control register: its interrupt-enable bit is the program's, kept as it
     * stored it, an Undo's restore putting back the one it had. The Ready bit is the device's to
     * state whatever was stored: the word an Undo puts back was stated before the keystrokes typed
     * since, and Ready has to answer for the ones waiting now.
     */
    private onControlWrite(register: number, value: number): void {
        const enabled = (value & MARS_INTERRUPT_ENABLE_BIT) !== 0
        if (register === MARS_TRANSMITTER_CONTROL) {
            this.transmitterInterrupts = enabled
            const core = this.core
            core?.setPeripheralWord(
                register | 0,
                MARS_READY_BIT | (enabled ? MARS_INTERRUPT_ENABLE_BIT : 0)
            )
            //turning the interrupt off withdraws a request no interrupt has taken yet; turning it
            //on asks for nothing, as in MARS, until the next character is taken. An Undo's restore
            //is not the program's: the Core puts the requests back itself
            if (!enabled && core && !this.rewinding && this.ownsMemory(core))
                core.clearExternalInterrupt(MARS_TRANSMITTER_INTERRUPT)
            return
        }
        this.receiverInterrupts = enabled
        this.core?.setPeripheralWord(register | 0, this.receiverControl())
        this.updateInterrupts()
    }

    private onTransmitterDataWrite(value: number): void {
        if (this.rewinding) return
        const character = value & 0xff
        if (character === FORM_FEED) {
            //MARS clears its display window: the output, not a read in progress or what is left of
            //the standard-input line, which are the program's input
            this.host.terminal.clearOutput()
        } else {
            this.host.terminal.write(String.fromCharCode(character))
        }
        this.transmitterReady()
    }

    /**
     * The console has taken a character and is Ready again, at once: with its interrupt enabled
     * that is one request, as MARS's transmitter makes one when its delay runs out. It waits, as a
     * pending request does on the hardware, until Status or `ustatus` lets it be taken, where MARS
     * drops a request it cannot take at that moment. A Poke's store is no character the program
     * sent, and a stale Emulator's devices must not interrupt the live program.
     */
    private transmitterReady(): void {
        const core = this.core
        if (!this.transmitterInterrupts || this.hostWriting) return
        if (!core || !this.ownsMemory(core)) return
        core.pulseExternalInterrupt(MARS_TRANSMITTER_INTERRUPT)
        this.tellInterruptListeners()
    }

    /** Whether these devices attached to `core`'s memory last, so its accesses are this program's. */
    private ownsMemory(core: MarsCore): boolean {
        return this.core === core && memoryOwners.get(memoryOf(core)) === this
    }

    /** Fills `words` from Core memory; the Screen keeps only the low 24 bits MARS colors use. */
    private readInto(from: number, to: number): void {
        const core = this.core
        const geometry = this.geometry
        if (!core || !geometry) return
        const last = Math.min(to, this.readableWords)
        if (last <= from) return
        this.words.set(
            core.readMemoryWords(marsWordAddress(geometry.baseAddress, from) | 0, last - from),
            from
        )
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
                core.readMemoryWords(marsWordAddress(geometry.baseAddress, index) | 0, 1)
                return true
            } catch {
                return false
            }
        }
        if (readable(geometry.words - 1)) return geometry.words
        return partitionPoint(geometry.words - 1, readable)
    }
}

/** What identifies the memory a Core shares with every other Core of its package. */
function memoryOf(core: MarsCore): object {
    return Object.getPrototypeOf(core) ?? core
}

/** Whether a display's grid overlaps any of the `size` bytes from `base`. */
function covers(geometry: MarsDisplayGeometry, base: number, size: number): boolean {
    return geometry.baseAddress >>> 0 < base + size && (geometry.endAddress >>> 0) + 4 > base
}

/**
 * `length` bytes of the Core's memory from `address`, 0 to 255 each; what the Core cannot read, an
 * upload whose source runs off the end of a segment, reads as 0.
 */
function readBytes(core: MarsCore, address: number, length: number): Uint8Array {
    const bytes = new Uint8Array(length)
    try {
        bytes.set(core.readMemoryBytes(address | 0, length).map((byte) => byte & 0xff))
        return bytes
    } catch {
        for (let offset = 0; offset < length; offset += READ_CHUNK) {
            const size = Math.min(READ_CHUNK, length - offset)
            try {
                const chunk = core.readMemoryBytes((address + offset) | 0, size)
                bytes.set(
                    chunk.map((byte) => byte & 0xff),
                    offset
                )
            } catch {
                //left as zeros
            }
        }
        return bytes
    }
}
