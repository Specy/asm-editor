import {
    TerminalHistory,
    type TerminalPosition
} from '#lib/languages/peripherals/TerminalHistory.ts'
import {
    PCM_BASE,
    PCM_BLOCK_SIZE,
    PCM_CONTROL,
    PCM_DATA,
    PCM_FIFO_FRAMES,
    PCM_FREE,
    PCM_ON_BIT,
    PCM_RATE,
    PCM_RATE_DEFAULT,
    PCM_RATE_MAX,
    PCM_RATE_MIN,
    PCM_STEREO_BIT
} from '../sampledAudioRegisters'
import {
    DRAIN_EPSILON,
    touches,
    waitVirtually,
    type SoundBus,
    type SoundDeviceHost
} from './soundDevice'

/**
 * The **Sampled-audio output** of MIPS and RISC-V: a memory-mapped DAC with a FIFO at 0xFFFF0350,
 * in the style of the Sound Blaster's or the Amiga's
 * ([ADR 0075](../../../../../../docs/adr/0075-mips-and-risc-v-get-a-midi-port-and-a-sampled-audio-output.md)).
 * It follows the rules x86's `/dev/dsp` follows in x86's Core, so this is a model of such a device
 * in TypeScript:
 *
 * - **Control** turns it on (bit 0) and picks stereo (bit 1); **Rate** is 4,000 to 48,000 frames a
 *   second, clamped and read back. Turning it off, or changing the rate or stereo while frames are
 *   queued, drops them, as changing a setting with sound queued does on `/dev/dsp`.
 * - **An 8,192-frame FIFO draining at its rate** on Program time; an empty FIFO plays silence.
 *   **Free** says how many frames it can take now, in mono always even, since a **Data** word holds
 *   two signed 16-bit samples, the low half first, and in stereo one frame, left in the low half.
 *   A word that does not fit, or written while the output is off, is dropped.
 * - **Undo** takes back the frames the undone writes queued that have not played yet, and puts the
 *   settings back; nothing already heard comes back
 *   ([ADR 0059](../../../../../../docs/adr/0059-undo-takes-back-the-sounds-an-instruction-made.md)),
 *   and what a setting dropped stays dropped.
 * - **In a Testcase** it is silent and keeps its timing on the virtual clock; reading Free while no
 *   word fits, or getting what the last read got with no word written since, moves that clock to
 *   the moment one more word fits, so a polling program never spins.
 * - At the end of a program the FIFO plays out; Stop drops it at once (the output's `stopAll`).
 *   Pause and Breakpoints change nothing: it goes on draining in Program time.
 *
 * The samples go to the output in chunks of consecutive frames, each with the Program time its
 * first frame plays at, at the end of every run call and before every wait: a word a store is far
 * too small to be a message of its own.
 *
 * Plain TypeScript, no runes, driven from inside the Core's synchronous execution. Free is written
 * ahead, at every access to the device, at the start of every run call and after every wait, since
 * the Cores tell an observer of a read only after the read; it can only lag behind the frames that
 * drained since, so writing as many frames as it says never drops one.
 */

/** What one instruction did to the output, for its Undo to take back. */
type PcmRecord = {
    readonly position: TerminalPosition
    /** How many frames it queued. */
    queued: number
    /** When the frames queued before its first ended, in Program milliseconds; null if it queued none. */
    endBefore: number | null
    /** Control and Rate as the instruction found them, when it changed them. */
    control?: number
    rate?: number
}

/** How many frames gather before they go to the output on their own, between flushes. */
const CHUNK_FRAMES = 4096

const SIXTEEN_BITS = 32768

const DATA_ADDRESS = `0x${(PCM_BASE + PCM_DATA).toString(16)}`
const OFF_NOTE =
    `Samples were dropped: the sampled-audio output was off. ` +
    `Turn it on with bit 0 of its Control register, 0x${(PCM_BASE + PCM_CONTROL).toString(16)}, before writing samples.`
const FULL_NOTE =
    `Samples were dropped: the sampled-audio output's FIFO was full. ` +
    `Write only as many frames as its Free register, 0x${(PCM_BASE + PCM_FREE).toString(16)}, says it can take.`
const PARTIAL_NOTE = `The sampled-audio output's Data register, ${DATA_ADDRESS}, takes whole words: write samples with sw.`

export class SampledAudioDevice {
    private readonly host: SoundDeviceHost
    private readonly base: number
    private bus: SoundBus | null = null
    private covered = false
    private control = 0
    private rate = PCM_RATE_DEFAULT
    /** Frames in the FIFO that have not played. */
    private level = 0
    /**
     * When the FIFO last started from empty, in Program milliseconds, and how many frames have
     * played since: frame `k` of the FIFO ends at `epoch + (drained + k + 1) / rate`.
     */
    private epoch = 0
    private drained = 0
    /** Frames written since the last flush, interleaved stereo, from frame `pendingFirst` of the stream. */
    private readonly pending = new Float32Array(CHUNK_FRAMES * 2)
    private pendingFrames = 0
    private pendingFirst = 0
    private readonly history = new TerminalHistory<PcmRecord>()
    /** What Free holds in memory, so a read pushes it only when it changed. */
    private freeInMemory: number | null = null
    /**
     * What the program's last read of Free got, until it writes a word: two reads that get the same
     * are a program waiting for more room.
     */
    private lastRead: number | null = null
    private readonly capture = (position: TerminalPosition): PcmRecord => ({
        position,
        queued: 0,
        endBefore: null
    })

    constructor(host: SoundDeviceHost, options: { base?: number } = {}) {
        this.host = host
        this.base = options.base ?? PCM_BASE
    }

    // ------------------------------------------------------------------ lifetime

    /** Points the device at a freshly assembled Core, or at none: a Build starts it off and empty. */
    connect(bus: SoundBus | null): void {
        this.bus = bus
        this.reset()
    }

    /** Build, Clear execution and the start of each Testcase: off, mono, 8,000 Hz, empty, no journal. */
    reset(): void {
        this.control = 0
        this.rate = PCM_RATE_DEFAULT
        this.level = 0
        this.epoch = 0
        this.drained = 0
        this.pendingFrames = 0
        this.lastRead = null
        this.history.clear()
        this.restate()
    }

    /** Whether a bitmap display covers the block: its words are then pixels, and the output is off. */
    setCovered(covered: boolean): void {
        if (this.covered === covered) return
        this.covered = covered
        if (!covered) this.restate()
    }

    get isCovered(): boolean {
        return this.covered
    }

    /** Journals the Build about to run, as the Terminal does: `position` names the instruction running. */
    track(position: () => TerminalPosition | null, capacity: number): void {
        this.history.track(position, capacity)
    }

    /** Writes the block's four words as the output has them: Control, Rate, Free, and Data 0. */
    restate(): void {
        if (!this.bus || this.covered) return
        this.push(PCM_CONTROL, this.control)
        this.push(PCM_RATE, this.rate)
        this.push(PCM_FREE, this.free)
        this.push(PCM_DATA, 0)
        this.freeInMemory = this.free
    }

    /** Brings Free up to date with Program time: before a run call, and after a wait. */
    refresh(): void {
        if (!this.bus || this.covered) return
        this.catchUp(this.host.clock().now())
        this.pushFree()
    }

    /** Hands the frames written since the last flush to the output: at a run call's end and before a wait. */
    flush(): void {
        if (this.pendingFrames === 0) return
        const frames = this.pending.subarray(0, this.pendingFrames * 2)
        const start = this.epoch + (this.pendingFirst * 1000) / this.rate
        this.pendingFrames = 0
        const audio = this.host.audio()
        if (!audio.silent) audio.timeline.pcm({ start, rate: this.rate, frames })
    }

    // --------------------------------------------------------------- the program

    /**
     * A store the program made into the block, or a Poke's when `fromProgram` is false, which the
     * output ignores. Then the output states the words the store touched again, over what it
     * stored, and Free when it changed.
     */
    stored(address: number, length: number, value: number, fromProgram: boolean): void {
        if (!this.bus || this.covered) return
        if (!touches(address, length, this.base, PCM_BLOCK_SIZE)) return
        if (fromProgram) {
            const now = this.host.clock().now()
            const control = this.base + PCM_CONTROL
            if (touches(address, length, control, 4))
                this.setControl(this.wordAt(control, address, length, value) & 3, now)
            const rate = this.base + PCM_RATE
            if (touches(address, length, rate, 4))
                this.setRate(this.wordAt(rate, address, length, value) >>> 0, now)
            const data = this.base + PCM_DATA
            if (touches(address, length, data, 4)) {
                if (address <= data && address + length >= data + 4)
                    this.write(this.wordAt(data, address, length, value), now)
                else this.host.audio().noteDevice(PARTIAL_NOTE)
            }
        }
        this.restateStored(address, length)
    }

    /**
     * After the program read Free: brought up to date for the next read. In a Testcase, a read while
     * no word fits moves the virtual clock to the moment one does, so a program waiting for room
     * never spins (decision 12 of [asmOS stage 2](../../../../../../docs/design/asmos-stage2.md)).
     * So does a read that gets what the one before it got, with no word written between, which is a
     * program waiting for more room than one word: the clock moves a word at a time until Free says
     * enough.
     */
    freeRead(): void {
        if (!this.bus || this.covered) return
        const clock = this.host.clock()
        this.catchUp(clock.now())
        //the read had the value memory held: what was pushed last
        const got = this.freeInMemory
        const unchanged = got !== null && got === this.lastRead
        this.lastRead = got
        if (clock.isVirtual && this.on && this.level > 0 && (this.free === 0 || unchanged)) {
            //the moment the head frames make room for one more word
            const room = PCM_FIFO_FRAMES - this.level
            const missing = room < this.frameSize ? this.frameSize - room : this.frameSize
            waitVirtually(clock, this.epoch + ((this.drained + missing) * 1000) / this.rate)
            this.catchUp(clock.now())
        }
        this.pushFree()
    }

    /**
     * Takes back every instruction after `position`, newest first: the frames each queued that have
     * not played, and the settings each changed. Then states the block again.
     */
    undoAfter(position: TerminalPosition): void {
        this.flush()
        this.history.undoAfter(position, (record) => {
            const now = this.host.clock().now()
            this.catchUp(now)
            if (record.queued > 0) {
                this.level -= Math.min(record.queued, this.level)
                this.cut(Math.max(now, record.endBefore ?? now))
            }
            const rate = record.rate ?? this.rate
            const control = record.control ?? this.control
            if (
                rate !== this.rate ||
                ((control ^ this.control) & PCM_STEREO_BIT) !== 0 ||
                (control & PCM_ON_BIT) === 0
            )
                this.drop(now)
            this.rate = rate
            this.control = control
        })
        this.restate()
    }

    // ------------------------------------------------------------- what it shows

    get on(): boolean {
        return (this.control & PCM_ON_BIT) !== 0
    }

    get stereo(): boolean {
        return (this.control & PCM_STEREO_BIT) !== 0
    }

    get frameRate(): number {
        return this.rate
    }

    /** How many frames the FIFO can take now, as Free says: in mono a whole number of words. */
    get free(): number {
        const room = PCM_FIFO_FRAMES - this.level
        return this.stereo ? room : room & ~1
    }

    /** How many frames wait to play, as of the last access. */
    get queued(): number {
        return this.level
    }

    // ---------------------------------------------------------------- internals

    /** How many frames a Data word holds. */
    private get frameSize(): number {
        return this.stereo ? 1 : 2
    }

    private setControl(control: number, now: number): void {
        if (control === this.control) return
        const record = this.history.current(this.capture)
        if (record && record.control === undefined) record.control = this.control
        //off empties the FIFO, and a change of format drops what was queued in the old one
        const off = (control & PCM_ON_BIT) === 0
        if (off || ((control ^ this.control) & PCM_STEREO_BIT) !== 0) this.drop(now)
        this.control = control
    }

    private setRate(requested: number, now: number): void {
        const rate = Math.min(PCM_RATE_MAX, Math.max(PCM_RATE_MIN, requested))
        if (rate === this.rate) return
        const record = this.history.current(this.capture)
        if (record && record.rate === undefined) record.rate = this.rate
        this.drop(now)
        this.rate = rate
    }

    private write(word: number, now: number): void {
        if (!this.on) {
            this.host.audio().noteDevice(OFF_NOTE)
            return
        }
        this.catchUp(now)
        const size = this.frameSize
        if (PCM_FIFO_FRAMES - this.level < size) {
            this.host.audio().noteDevice(FULL_NOTE)
            return
        }
        if (this.level === 0) {
            //an empty FIFO plays silence until this word: the stream starts again now
            this.flush()
            this.epoch = now
            this.drained = 0
        }
        const index = this.drained + this.level
        const record = this.history.current(this.capture)
        if (record) {
            record.endBefore ??= this.epoch + (index * 1000) / this.rate
            record.queued += size
        }
        this.level += size
        this.lastRead = null
        if (!this.host.audio().silent) {
            const low = ((word << 16) >> 16) / SIXTEEN_BITS
            const high = (word >> 16) / SIXTEEN_BITS
            if (this.stereo) this.append(index, low, high)
            else {
                this.append(index, low, low)
                this.append(index + 1, high, high)
            }
        }
        this.pushFree()
    }

    /** One frame for the output, at frame `index` of the stream. */
    private append(index: number, left: number, right: number): void {
        if (this.pendingFrames > 0 && this.pendingFirst + this.pendingFrames !== index) this.flush()
        if (this.pendingFrames === 0) this.pendingFirst = index
        this.pending[this.pendingFrames * 2] = left
        this.pending[this.pendingFrames * 2 + 1] = right
        this.pendingFrames++
        if (this.pendingFrames === CHUNK_FRAMES) this.flush()
    }

    /** Drops what the FIFO holds: what has not played is cut from the output. */
    private drop(now: number): void {
        this.catchUp(now)
        this.flush()
        if (this.level > 0) this.cut(now)
        this.level = 0
    }

    private cut(after: number): void {
        const audio = this.host.audio()
        if (!audio.silent) audio.timeline.cut({ after, device: 'dsp' })
    }

    /** The frames that have played by `now` leave the FIFO. */
    private catchUp(now: number): void {
        if (this.level === 0) return
        const played = Math.floor(((now - this.epoch) * this.rate) / 1000 + DRAIN_EPSILON)
        const count = Math.min(this.level, Math.max(0, played - this.drained))
        this.drained += count
        this.level -= count
    }

    /** The word a store left at `register`: its own when it is that word, memory's otherwise. */
    private wordAt(register: number, address: number, length: number, value: number): number {
        if (address === register && length === 4) return value | 0
        return (this.bus?.readWord(register) ?? 0) | 0
    }

    /** Writes back the words a store touched, as the output has them, and Free if it changed. */
    private restateStored(address: number, length: number): void {
        for (let offset = 0; offset < PCM_BLOCK_SIZE; offset += 4) {
            if (!touches(address, length, this.base + offset, 4)) continue
            const value =
                offset === PCM_CONTROL
                    ? this.control
                    : offset === PCM_RATE
                      ? this.rate
                      : offset === PCM_FREE
                        ? this.free
                        : 0
            this.push(offset, value)
            if (offset === PCM_FREE) this.freeInMemory = value
        }
        this.pushFree()
    }

    private pushFree(): void {
        const free = this.free
        if (free === this.freeInMemory) return
        this.push(PCM_FREE, free)
        this.freeInMemory = free
    }

    private push(offset: number, value: number): void {
        if (!this.bus || this.covered) return
        this.bus.push((this.base + offset) | 0, value | 0)
    }
}
