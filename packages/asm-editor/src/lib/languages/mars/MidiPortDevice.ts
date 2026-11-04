import type { Audio } from '#lib/languages/peripherals/audio/Audio.ts'
import {
    TerminalHistory,
    type TerminalPosition
} from '#lib/languages/peripherals/TerminalHistory.ts'
import {
    MIDI_BYTE_MS,
    MIDI_PORT_BASE,
    MIDI_PORT_BLOCK_SIZE,
    MIDI_PORT_BUFFER_BYTES,
    MIDI_PORT_BUSY_BIT,
    MIDI_PORT_COMMAND,
    MIDI_PORT_DATA,
    MIDI_PORT_NO_INPUT_BIT,
    MIDI_PORT_RESET,
    MIDI_PORT_STATUS
} from '../midiPortRegisters'
import {
    DRAIN_EPSILON,
    touches,
    waitVirtually,
    type SoundBus,
    type SoundDeviceHost
} from './soundDevice'

/**
 * The **MIDI port** of MIPS and RISC-V: a memory-mapped device at 0xFFFF0340, in the style of the
 * MPU-401's UART mode, through which a program sends MIDI bytes to the General MIDI synthesizer
 * ([ADR 0075](../../../../../../docs/adr/0075-mips-and-risc-v-get-a-midi-port-and-a-sampled-audio-output.md)).
 * It follows the rules x86's raw MIDI port follows, which live in x86's Core (`libblink/blink/
 * rawmidi.c`), so this is a model of that port in TypeScript:
 *
 * - **A 4 KiB buffer draining at 31,250 baud** on Program time, ten bits a byte. A byte written while
 *   the buffer is full is dropped, as on the hardware, so a program checks Status's busy bit first.
 *   Status reads `0x80`, or `0xC0` while busy: bit 7 always set, since nothing comes in.
 * - **Message assembly** as Linux's sequencer encoder does it (`seq_midi_event.c`), with running
 *   status and SysEx up to 256 bytes; each complete message goes to the synthesizer with the time
 *   its last byte leaves. Real-time and system common bytes take their time on the line and are not
 *   handed on.
 * - **The Command register**, Status's address written: `0xFF` resets, the buffer emptied and every
 *   note the synthesizer holds ended; `0x3F`, which enters UART mode on an MPU-401, does nothing.
 * - **Undo** ([ADR 0059](../../../../../../docs/adr/0059-undo-takes-back-the-sounds-an-instruction-made.md)):
 *   what the synthesizer was told is kept twice, as of every byte queued (`look`) and as of the
 *   bytes that have left (`sent`). Undoing a write takes back its bytes still waiting, cuts what
 *   they would have played, and, when some of them had already left, tells the synthesizer what
 *   puts its channels' programs, controllers, pitch bend and master volume back, and stops the notes
 *   they started. A note they ended does not start again.
 * - **In a Testcase** it is silent and keeps its timing on the virtual clock; reading Status while
 *   busy moves that clock to the moment the next byte leaves, so a polling program never spins.
 * - The end of a program, Stop and the GM reset at every Build are the output's: it releases the
 *   notes once the buffer is out, silences its synthesizer at once, and gets a reset one for the next
 *   run (`midiPort.ts`, `synthesizerEngine.ts`). Pause and Breakpoints change nothing.
 *
 * The port has a synthesizer of its own, sixteen channels with the drums on channel 10, as x86's
 * port does: MARS's and RARS's MIDI services, syscalls 31 and 33, play every Note on a channel of
 * its own of another synthesizer, so the two share no channel, and a program change on the port
 * never changes a Note's instrument.
 *
 * Plain TypeScript, no runes, driven from inside the Core's synchronous execution like the other
 * MARS devices. Everything a program reads is in memory before it reads it: the Cores tell an
 * observer of a read only after the read has its value, so Status is written ahead, at every access
 * to the port, at the start of every run call and after every wait.
 */

// ------------------------------------------------------------ the parser

/** seq_midi_event.c's types: the channel messages by their status's high nibble, then F0 to FF. */
const ST_INVALID = 7
const ST_SPECIAL = 8
const ST_SYSEX = ST_SPECIAL
/** How many data bytes each type takes; -1 for none it can make a message of. */
const QUEUE_LENGTH = [2, 2, 2, 2, 1, 1, 2, -1, 1, 1, 2, 1, -1, -1, 0, -1] as const
/** The encoder's buffer: a longer SysEx is not handed on at all. */
const EVENT_BUFFER = 256

class MidiParser {
    type = ST_INVALID
    qlen = 0
    read = 0
    overflow = false
    readonly buffer = new Uint8Array(EVENT_BUFFER)

    copyFrom(other: MidiParser): void {
        this.type = other.type
        this.qlen = other.qlen
        this.read = other.read
        this.overflow = other.overflow
        this.buffer.set(other.buffer.subarray(0, other.read))
    }

    clone(): MidiParser {
        const copy = new MidiParser()
        copy.copyFrom(this)
        return copy
    }

    reset(): void {
        this.type = ST_INVALID
        this.qlen = 0
        this.read = 0
        this.overflow = false
    }

    /**
     * `snd_midi_event_encode_byte()`: the length of the message `byte` completes in `buffer`, when it
     * is one the synthesizer takes, else 0.
     */
    parse(byte: number): number {
        if (byte >= 0xf8) return 0
        if ((byte & 0x80) !== 0 && (byte !== 0xf7 || this.type !== ST_SYSEX)) {
            this.buffer[0] = byte
            this.type = (byte & 0xf0) === 0xf0 ? (byte & 0x0f) + ST_SPECIAL : (byte >> 4) & 7
            this.read = 1
            this.qlen = QUEUE_LENGTH[this.type]
            this.overflow = false
        } else if (this.qlen > 0) {
            this.buffer[this.read++] = byte
            if (this.type !== ST_SYSEX) this.qlen--
        } else {
            //running status: a data byte after a complete message starts another of the same kind
            this.buffer[1] = byte
            this.qlen = QUEUE_LENGTH[this.type] - 1
            this.read = 2
        }
        if (this.qlen === 0) {
            const type = this.type
            if (this.type >= ST_SPECIAL) this.type = ST_INVALID
            return type < ST_INVALID ? this.read : 0
        }
        if (this.type === ST_SYSEX && (byte === 0xf7 || this.read >= EVENT_BUFFER)) {
            const length = this.read
            const overflow = this.overflow
            this.read = 0
            if (byte !== 0xf7) {
                this.overflow = true
                return 0
            }
            this.qlen = 0
            this.type = ST_INVALID
            this.overflow = false
            return overflow ? 0 : length
        }
        return 0
    }
}

// ------------------------------------------------------------ the synthesizer

/**
 * What the synthesizer keeps, as Undo puts it back: per channel its program, pressure, whether the
 * parameter number selected last was an NRPN, its 128 controllers, the 128 notes it holds, its pitch
 * bend and three registered parameters (bend range, fine and coarse tuning); then master volume.
 */
const PROGRAM = 0
const PRESSURE = 1
const NRPN = 2
const CC = 3
const HELD = CC + 128
const BEND = HELD + 128
const RPN = BEND + 1
const CHANNEL_SIZE = RPN + 3
const CHANNELS = 16
const MASTER = CHANNELS * CHANNEL_SIZE
const SYNTH_SIZE = MASTER + 1

type SynthState = Int32Array

/** General MIDI's power-on state, which GM System On and the GS and XG resets also give. */
function defaultSynth(state: SynthState = new Int32Array(SYNTH_SIZE)): SynthState {
    state.fill(0)
    for (let channel = 0; channel < CHANNELS; channel++) {
        const at = channel * CHANNEL_SIZE
        state[at + CC + 7] = 100
        state[at + CC + 10] = 64
        state[at + CC + 11] = 127
        for (let cc = 98; cc <= 101; cc++) state[at + CC + cc] = 127
        state[at + BEND] = 8192
        state[at + RPN] = 2 << 7
        state[at + RPN + 1] = 8192
        state[at + RPN + 2] = 64 << 7
    }
    state[MASTER] = 16383
    return state
}

const DEFAULT_SYNTH = defaultSynth()

const GM_ON = [0xf0, 0x7e, 0x7f, 0x09, 0x01, 0xf7]
const GM2_ON = [0xf0, 0x7e, 0x7f, 0x09, 0x03, 0xf7]
const GS_RESET = [0xf0, 0x41, 0x10, 0x42, 0x12, 0x40, 0x00, 0x7f, 0x00, 0x41, 0xf7]
const XG_ON = [0xf0, 0x43, 0x10, 0x4c, 0x00, 0x00, 0x7e, 0x00, 0xf7]

function sysexIs(message: Uint8Array, length: number, pattern: readonly number[]): boolean {
    if (length !== pattern.length) return false
    //the device number, byte 2, is anything
    for (let i = 0; i < length; i++) if (i !== 2 && message[i] !== pattern[i]) return false
    return true
}

/**
 * What a complete message changes in what the synthesizer keeps. `diffs`, when given, collects each
 * change as the index and the value it held, for Undo to put back.
 */
function applyMessage(
    state: SynthState,
    message: Uint8Array,
    length: number,
    diffs: number[] | null
): void {
    const set = (index: number, value: number) => {
        if (state[index] === value) return
        diffs?.push(index, state[index])
        state[index] = value
    }
    if (message[0] === 0xf0) {
        if (
            sysexIs(message, length, GM_ON) ||
            sysexIs(message, length, GM2_ON) ||
            sysexIs(message, length, GS_RESET) ||
            (length === XG_ON.length &&
                (message[2] & 0xf0) === 0x10 &&
                sysexIs(message, length, XG_ON))
        ) {
            for (let index = 0; index < SYNTH_SIZE; index++) set(index, DEFAULT_SYNTH[index])
        } else if (
            length === 8 &&
            message[1] === 0x7f &&
            message[3] === 0x04 &&
            message[4] === 0x01 &&
            message[7] === 0xf7
        ) {
            //Master Volume
            set(MASTER, (message[6] << 7) | message[5])
        }
        return
    }
    const at = (message[0] & 0x0f) * CHANNEL_SIZE
    switch (message[0] & 0xf0) {
        case 0x80:
            set(at + HELD + message[1], 0)
            break
        case 0x90:
            set(at + HELD + message[1], message[2] > 0 ? 1 : 0)
            break
        case 0xb0: {
            const cc = message[1]
            const value = message[2]
            if (cc === 120 || cc >= 123) {
                //All Sound Off, All Notes Off and the mode messages end every note
                for (let key = 0; key < 128; key++) set(at + HELD + key, 0)
            } else if (cc === 121) {
                //Reset All Controllers, as RP-015 says
                set(at + CC + 1, 0)
                set(at + CC + 11, 127)
                for (let i = 64; i <= 67; i++) set(at + CC + i, 0)
                for (let i = 98; i <= 101; i++) set(at + CC + i, 127)
                set(at + BEND, 8192)
                set(at + PRESSURE, 0)
            } else if (cc !== 122) {
                set(at + CC + cc, value)
                if (cc === 100 || cc === 101) set(at + NRPN, 0)
                if (cc === 98 || cc === 99) set(at + NRPN, 1)
                const selected = state[at + CC + 100]
                if (
                    (cc === 6 || cc === 38) &&
                    state[at + NRPN] === 0 &&
                    state[at + CC + 101] === 0 &&
                    selected < 3
                ) {
                    const rpn = state[at + RPN + selected]
                    set(
                        at + RPN + selected,
                        cc === 6 ? (value << 7) | (rpn & 0x7f) : (rpn & ~0x7f) | value
                    )
                }
            }
            break
        }
        case 0xc0:
            set(at + PROGRAM, message[1])
            break
        case 0xd0:
            set(at + PRESSURE, message[1])
            break
        case 0xe0:
            set(at + BEND, (message[2] << 7) | message[1])
            break
    }
}

/**
 * The messages that take the synthesizer from `from` to `to`: the notes `to` does not hold are
 * released, and every setting that differs is sent again. Notes `to` holds that `from` does not are
 * not started: Undo never starts a note the program ended.
 */
function restoreMessages(from: SynthState, to: SynthState): Uint8Array[] {
    const messages: Uint8Array[] = []
    const controller = (channel: number, cc: number, value: number) =>
        messages.push(Uint8Array.of(0xb0 | channel, cc, value))
    for (let channel = 0; channel < CHANNELS; channel++) {
        const at = channel * CHANNEL_SIZE
        const f = (index: number) => from[at + index]
        const t = (index: number) => to[at + index]
        for (let key = 0; key < 128; key++) {
            if (f(HELD + key) && !t(HELD + key))
                messages.push(Uint8Array.of(0x80 | channel, key, 0))
        }
        const bank = f(CC) !== t(CC) || f(CC + 32) !== t(CC + 32)
        if (bank) {
            controller(channel, 0, t(CC))
            controller(channel, 32, t(CC + 32))
        }
        if (bank || f(PROGRAM) !== t(PROGRAM))
            messages.push(Uint8Array.of(0xc0 | channel, t(PROGRAM)))
        for (let cc = 0; cc < 120; cc++) {
            //bank select, and data entry with what selects for it
            if (cc === 0 || cc === 32 || cc === 6 || cc === 38 || (cc >= 96 && cc <= 101)) continue
            if (f(CC + cc) !== t(CC + cc)) controller(channel, cc, t(CC + cc))
        }
        let select = f(NRPN) !== t(NRPN)
        for (let cc = 98; cc <= 101; cc++) select ||= f(CC + cc) !== t(CC + cc)
        for (let i = 0; i < 3; i++) {
            if (f(RPN + i) === t(RPN + i)) continue
            controller(channel, 101, 0)
            controller(channel, 100, i)
            controller(channel, 6, t(RPN + i) >> 7)
            controller(channel, 38, t(RPN + i) & 0x7f)
            select = true
        }
        if (select) {
            const order = t(NRPN) ? [101, 100, 99, 98] : [99, 98, 101, 100]
            for (const cc of order) controller(channel, cc, t(CC + cc))
        }
        if (f(BEND) !== t(BEND))
            messages.push(Uint8Array.of(0xe0 | channel, t(BEND) & 0x7f, t(BEND) >> 7))
        if (f(PRESSURE) !== t(PRESSURE)) messages.push(Uint8Array.of(0xd0 | channel, t(PRESSURE)))
    }
    if (from[MASTER] !== to[MASTER]) {
        const master = to[MASTER]
        messages.push(Uint8Array.of(0xf0, 0x7f, 0x7f, 0x04, 0x01, master & 0x7f, master >> 7, 0xf7))
    }
    return messages
}

// ------------------------------------------------------------ the port

/** What one instruction's writes did, for its Undo to take back. */
type MidiRecord = {
    readonly position: TerminalPosition
    /** How many bytes it queued. */
    queued: number
    /** When what was queued before it had left, in Program milliseconds. */
    readonly endBefore: number
    /** The queue's parser before its first byte. */
    readonly parser: MidiParser
    /** What its bytes changed in `look`, as pairs of an index and the value it held. */
    readonly diffs: number[]
}

const STATUS_READY = MIDI_PORT_NO_INPUT_BIT
const STATUS_BUSY = MIDI_PORT_NO_INPUT_BIT | MIDI_PORT_BUSY_BIT

const BUSY_NOTE =
    `A MIDI byte was dropped: the MIDI port was busy, its buffer full. ` +
    `Wait until bit 6 of its Status register, 0x${(MIDI_PORT_BASE + MIDI_PORT_STATUS).toString(16)}, is clear before writing a byte.`

export class MidiPortDevice {
    private readonly host: SoundDeviceHost
    private readonly base: number
    private bus: SoundBus | null = null
    private covered = false
    private readonly ring = new Uint8Array(MIDI_PORT_BUFFER_BYTES)
    /** The bytes that have not left: `ring[head..head+level)`, circularly. */
    private head = 0
    private level = 0
    /**
     * When the line last started from idle, in Program milliseconds, and how many bytes have left
     * since: byte `k` of the queue has left at `epoch + (left + k + 1) × 0.32`, a count that does not
     * gather rounding as a running start time would.
     */
    private epoch = 0
    private left = 0
    private readonly lookParser = new MidiParser()
    private readonly sentParser = new MidiParser()
    /** What the synthesizer has been told as of every byte queued, and as of the bytes that have left. */
    private readonly look = defaultSynth()
    private readonly sent = defaultSynth()
    private readonly history = new TerminalHistory<MidiRecord>()
    /** What Status holds in memory, so a read pushes it only when it changed. */
    private statusInMemory: number | null = null
    /** The Audio whose MIDI port's synthesizer has been asked for. */
    private preparedFor: Audio | null = null
    /** The moment the write being journaled saw, for `capture`. */
    private captureNow = 0
    private readonly capture = (position: TerminalPosition): MidiRecord => ({
        position,
        queued: 0,
        endBefore: this.endTime(this.captureNow),
        parser: this.lookParser.clone(),
        diffs: []
    })

    constructor(host: SoundDeviceHost, options: { base?: number } = {}) {
        this.host = host
        this.base = options.base ?? MIDI_PORT_BASE
    }

    // ------------------------------------------------------------------ lifetime

    /** Points the device at a freshly assembled Core, or at none: a Build starts it empty. */
    connect(bus: SoundBus | null): void {
        this.bus = bus
        this.reset()
    }

    /**
     * Build, Clear execution and the start of each Testcase: an empty buffer, General MIDI's
     * defaults, as the output's reset synthesizer has them, and no journal.
     */
    reset(): void {
        this.head = 0
        this.level = 0
        this.epoch = 0
        this.left = 0
        this.lookParser.reset()
        this.sentParser.reset()
        defaultSynth(this.look)
        defaultSynth(this.sent)
        this.history.clear()
        this.preparedFor = null
        this.restate()
    }

    /** Whether a bitmap display covers the block: its words are then pixels, and the port is off. */
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

    /** Writes the block's four words as the port has them: Data 0, Status, and the reserved words 0. */
    restate(): void {
        if (!this.bus || this.covered) return
        this.push(MIDI_PORT_DATA, 0)
        this.push(MIDI_PORT_STATUS, this.status())
        this.push(0x08, 0)
        this.push(0x0c, 0)
        this.statusInMemory = this.status()
    }

    /** Brings Status up to date with Program time: before a run call, and after a wait. */
    refresh(): void {
        if (!this.bus || this.covered) return
        this.catchUp(this.host.clock().now())
        this.pushStatus()
    }

    // --------------------------------------------------------------- the program

    /**
     * A store the program made into the block, or a Poke's when `fromProgram` is false, which the
     * port ignores. Data takes the store's byte at its address, Command the byte at Status's; then
     * the port states the words the store touched again, over what it stored.
     */
    stored(address: number, length: number, value: number, fromProgram: boolean): void {
        if (!this.bus || this.covered) return
        if (!touches(address, length, this.base, MIDI_PORT_BLOCK_SIZE)) return
        if (fromProgram) {
            const now = this.host.clock().now()
            const data = this.base + MIDI_PORT_DATA
            if (touches(address, length, data, 1))
                this.write(this.byteAt(data, address, value), now)
            const command = this.base + MIDI_PORT_COMMAND
            if (touches(address, length, command, 1))
                this.command(this.byteAt(command, address, value), now)
        }
        this.restateStored(address, length)
    }

    /**
     * After the program read Status: brought up to date for the next read. In a Testcase, a read
     * while the port is busy moves the virtual clock to the moment the next byte leaves, so a program
     * waiting for room never spins (decision 12 of [asmOS stage 2](../../../../../../docs/design/asmos-stage2.md)).
     */
    statusRead(): void {
        if (!this.bus || this.covered) return
        const clock = this.host.clock()
        this.catchUp(clock.now())
        if (clock.isVirtual && this.busy) {
            waitVirtually(clock, this.epoch + (this.left + 1) * MIDI_BYTE_MS)
            this.catchUp(clock.now())
        }
        this.pushStatus()
    }

    /**
     * Takes back every instruction after `position`, newest first: the bytes each queued that have
     * not left, what they would have played, and, when some had left already, what they told the
     * synthesizer. Then states the block again.
     */
    undoAfter(position: TerminalPosition): void {
        this.history.undoAfter(position, (record) => {
            const now = this.host.clock().now()
            this.catchUp(now)
            const unsent = Math.min(record.queued, this.level)
            this.level -= unsent
            const cut = Math.max(now, record.endBefore)
            this.timeline()?.cut({ after: cut, device: 'midi' })
            for (let i = record.diffs.length - 2; i >= 0; i -= 2)
                this.look[record.diffs[i]] = record.diffs[i + 1]
            this.lookParser.copyFrom(record.parser)
            if (unsent < record.queued) {
                //some of it reached the synthesizer, so everything before it did too: what it set
                //is set back from what was heard
                const heard = this.sent.slice()
                this.sent.set(this.look)
                this.sentParser.copyFrom(this.lookParser)
                for (const message of restoreMessages(heard, this.look)) this.emit(cut, message)
            }
        })
        this.restate()
    }

    // ------------------------------------------------------------- what it shows

    /** Whether the buffer is full, so a byte written now is dropped. */
    get busy(): boolean {
        return this.level >= MIDI_PORT_BUFFER_BYTES
    }

    /** How many bytes wait to leave, as of the last access. */
    get queued(): number {
        return this.level
    }

    // ---------------------------------------------------------------- internals

    private status(): number {
        return this.busy ? STATUS_BUSY : STATUS_READY
    }

    private write(byte: number, now: number): void {
        this.catchUp(now)
        if (this.busy) {
            this.host.audio().noteDevice(BUSY_NOTE)
            return
        }
        this.captureNow = now
        const record = this.history.current(this.capture)
        if (this.level === 0) {
            //the line is idle: this byte starts leaving now
            this.epoch = now
            this.left = 0
        }
        const at = this.epoch + (this.left + this.level + 1) * MIDI_BYTE_MS
        this.ring[(this.head + this.level) % MIDI_PORT_BUFFER_BYTES] = byte
        this.level++
        if (record) record.queued++
        const length = this.lookParser.parse(byte)
        if (length > 0) {
            const message = this.lookParser.buffer.subarray(0, length)
            applyMessage(this.look, message, length, record?.diffs ?? null)
            this.emit(at, message)
        }
        this.pushStatus()
    }

    /**
     * The Command register. A reset empties the buffer, as a DROP does on x86, and ends every note
     * the synthesizer holds at once; Undo brings back neither, since it never starts a sound.
     */
    private command(value: number, now: number): void {
        if (value !== MIDI_PORT_RESET) return
        this.catchUp(now)
        if (this.level > 0) this.timeline()?.cut({ after: now, device: 'midi' })
        this.level = 0
        this.look.set(this.sent)
        this.lookParser.reset()
        this.sentParser.reset()
        for (let channel = 0; channel < CHANNELS; channel++) {
            const at = channel * CHANNEL_SIZE
            let holds = false
            for (let key = 0; key < 128 && !holds; key++) holds = this.sent[at + HELD + key] !== 0
            if (!holds) continue
            const message = Uint8Array.of(0xb0 | channel, 123, 0)
            applyMessage(this.look, message, 3, null)
            applyMessage(this.sent, message, 3, null)
            this.emit(now, message)
        }
    }

    /** The bytes that have left by `now` reach what the synthesizer was sent. */
    private catchUp(now: number): void {
        if (this.level === 0) return
        const gone = Math.floor((now - this.epoch) / MIDI_BYTE_MS + DRAIN_EPSILON) - this.left
        const count = Math.min(this.level, Math.max(0, gone))
        for (let i = 0; i < count; i++) {
            const byte = this.ring[(this.head + i) % MIDI_PORT_BUFFER_BYTES]
            const length = this.sentParser.parse(byte)
            if (length > 0) applyMessage(this.sent, this.sentParser.buffer, length, null)
        }
        this.head = (this.head + count) % MIDI_PORT_BUFFER_BYTES
        this.level -= count
        this.left += count
    }

    /** When the last byte queued leaves, or `now` when none waits. */
    private endTime(now: number): number {
        return this.level > 0 ? this.epoch + (this.left + this.level) * MIDI_BYTE_MS : now
    }

    /** A message to the synthesizer at `at`: the first of a run readies it without holding the program. */
    private emit(at: number, message: Uint8Array): void {
        const audio = this.host.audio()
        if (audio.silent) return
        if (this.preparedFor !== audio) {
            this.preparedFor = audio
            void audio.prepare('midiPort')
        }
        audio.timeline.midi({ at, message })
    }

    private timeline() {
        const audio = this.host.audio()
        return audio.silent ? null : audio.timeline
    }

    /** The byte a store left at `register`: its own when it starts there, memory's otherwise. */
    private byteAt(register: number, address: number, value: number): number {
        if (address === register) return value & 0xff
        return ((this.bus?.readWord(register & ~3) ?? 0) >>> (8 * (register & 3))) & 0xff
    }

    /** Writes back the words a store touched, as the port has them, and Status if it changed. */
    private restateStored(address: number, length: number): void {
        for (let offset = 0; offset < MIDI_PORT_BLOCK_SIZE; offset += 4) {
            if (!touches(address, length, this.base + offset, 4)) continue
            const value = offset === MIDI_PORT_STATUS ? this.status() : 0
            this.push(offset, value)
            if (offset === MIDI_PORT_STATUS) this.statusInMemory = value
        }
        this.pushStatus()
    }

    private pushStatus(): void {
        const status = this.status()
        if (status === this.statusInMemory) return
        this.push(MIDI_PORT_STATUS, status)
        this.statusInMemory = status
    }

    private push(offset: number, value: number): void {
        if (!this.bus || this.covered) return
        this.bus.push((this.base + offset) | 0, value | 0)
    }
}
