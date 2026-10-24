import {
    SYNTH_BLOCK_SIZE,
    SYNTH_CHANNEL_COUNT,
    SYNTH_CHANNEL_REGISTERS,
    SYNTH_CHANNEL_SIZE,
    SYNTH_CONTROL,
    SYNTH_GATE,
    SYNTH_SAMPLE_MEMORY_SIZE,
    SYNTH_UPLOAD_DESTINATION,
    SYNTH_UPLOAD_LENGTH,
    SYNTH_UPLOAD_SOURCE,
    SYNTH_UPLOAD_START,
    SYNTH_VOLUME,
    SYNTH_WAVETABLES
} from '../../synthRegisters'
import type { ChipCommand } from './AudioOutput'

/**
 * The **Synth** as a program sees it: MIPS's, RISC-V's and the M68K's memory-mapped waveform chip
 * ([the design record](../../../../../../../docs/design/waveform-sound.md#the-register-map)). Its
 * registers are the Core's memory, which the program reads back and the Core rewinds on Undo; this
 * keeps a mirror of them, fed every store into the block in order as it happens, and turns each into
 * register writes for the chip in the output, so a gate pulsed off and on within one slice still
 * retriggers. An upload copies from the program's memory the moment its start register is written,
 * into Sample memory, which is the chip's own and only here and in the output.
 *
 * Nothing a program observes depends on it: in a Testcase it does nothing at all.
 */

/** How the Synth reaches the Target: its byte order, and its memory for an upload to copy from. */
export type SynthBus = {
    readonly littleEndian: boolean
    /** Reads `length` bytes from `address`; bytes the Core cannot read come back as 0. */
    read(address: number, length: number): ArrayLike<number>
}

/** What a chip needs of the Audio it belongs to. */
export type ChipHost = {
    readonly silent: boolean
    /** Adds a command to the batch the next flush sends. */
    send(command: ChipCommand): void
    /** Journals how to put a change back, with the instruction running. */
    record(restore: () => void): void
    /** A channel started to sound, which counts as a sound started. */
    started(): void
}

/** Whether a register offset is a channel's control register, whose writes make the gate's edges. */
export function isSynthControl(offset: number): boolean {
    return offset < SYNTH_WAVETABLES && offset % SYNTH_CHANNEL_SIZE === SYNTH_CONTROL
}

/**
 * The same writes, folded to what one instant of the chip needs. Every write of one batch reaches
 * the chip at the same moment, so of every other register only the last value counts, and of a
 * control register its first write, which makes whatever edge it makes against the chip's state
 * before the batch, its last, and one gate edge between them when the gate went off and on in
 * between, which strikes the note again as any number of such edges would. A batch is folded once
 * it grows past what a program that stores into the block in a tight loop would otherwise send
 * every slice.
 */
export function compactSynthWrites(writes: readonly number[]): number[] {
    const values = new Map<number, number>()
    const controls = new Map<number, { first: number; last: number; struck: boolean }>()
    for (let i = 0; i < writes.length; i += 2) {
        const offset = writes[i]
        const value = writes[i + 1]
        if (!isSynthControl(offset)) {
            values.delete(offset)
            values.set(offset, value)
            continue
        }
        const control = controls.get(offset)
        if (control === undefined) {
            controls.set(offset, { first: value, last: value, struck: false })
            continue
        }
        if (!(control.last & SYNTH_GATE) && value & SYNTH_GATE) control.struck = true
        control.last = value
    }
    const compact: number[] = []
    for (const [offset, value] of values) compact.push(offset, value)
    for (const [offset, { first, last, struck }] of controls) {
        compact.push(offset, first)
        //a strike after the first write: off then on again, ending as the last write left it
        if (struck) compact.push(offset, last & ~SYNTH_GATE, offset, last | SYNTH_GATE)
        if (compact.at(-1) !== last) compact.push(offset, last)
    }
    return compact
}

/** Each byte of a channel's block: the register it belongs to, or -1 for a reserved one. */
const CHANNEL_REGISTER_AT = Array.from({ length: SYNTH_CHANNEL_SIZE }, (_, offset) => {
    const index = SYNTH_CHANNEL_REGISTERS.findIndex(
        (register) => offset >= register.offset && offset < register.offset + register.bytes
    )
    return index
})

export class Synth {
    private readonly mirror = new Uint8Array(SYNTH_BLOCK_SIZE)
    /** Sample memory as the uploads left it; made by the first one. */
    private samples: Uint8Array | null = null
    private littleEndian = true
    /** Whether the program has stored into the block since the last reset. */
    private used = false
    /**
     * Set while a Poke writes the block: its registers play as the program's stores would, but it
     * starts no upload. An upload is the running program's, and a Poke's Undo, which no
     * instruction's journal holds, only re-reads the registers.
     */
    poking = false

    constructor(private readonly host: ChipHost) {}

    /**
     * A store of `size` bytes of `value` at `offset` from the block's base, as the Core made it;
     * the part of it outside the block, if it straddles an edge, is ignored.
     */
    store(offset: number, size: number, value: number, bus: SynthBus): void {
        if (this.host.silent) return
        this.used = true
        this.littleEndian = bus.littleEndian
        const from = Math.max(0, offset)
        const to = Math.min(SYNTH_BLOCK_SIZE, offset + size)
        if (from >= to) return
        const before = this.soundingChannels()
        for (let address = from; address < to; address++) {
            const k = address - offset
            const shift = 8 * (bus.littleEndian ? k : size - 1 - k)
            this.mirror[address] = (value >>> shift) & 0xff
        }
        const writes: number[] = []
        let address = from
        while (address < to) {
            const register = this.registerAt(address)
            if (register === null) {
                address++
                continue
            }
            if (register.offset === SYNTH_UPLOAD_START) {
                if (!this.poking) {
                    this.flushWrites(writes)
                    this.upload(bus)
                }
            } else if (register.offset < SYNTH_UPLOAD_SOURCE) {
                writes.push(register.offset, this.read(register.offset, register.bytes))
            }
            address = register.offset + register.bytes
        }
        this.flushWrites(writes)
        //a channel starts to sound when its gate is on and its volume above 0, whichever came last
        const started = this.soundingChannels() & ~before
        for (let channel = 0; channel < SYNTH_CHANNEL_COUNT; channel++) {
            if (started & (1 << channel)) this.host.started()
        }
    }

    /**
     * After an Undo, the block as the Core rewound it: the registers that differ from the mirror
     * are written to the chip again, a gate the Undo turned back on attacking again. `all` writes
     * every one, for a chip the output has released since, whose state the mirror no longer is.
     */
    resync(block: ArrayLike<number>, all: boolean): void {
        if (this.host.silent || !this.used) return
        const before = this.mirror.slice()
        this.mirror.set(Array.from(block).slice(0, SYNTH_BLOCK_SIZE))
        const writes: number[] = []
        for (let offset = 0; offset < SYNTH_UPLOAD_SOURCE;) {
            const register = this.registerAt(offset)
            if (register === null) {
                offset++
                continue
            }
            let changed = all
            for (let k = 0; k < register.bytes && !changed; k++) {
                changed = before[offset + k] !== this.mirror[offset + k]
            }
            if (changed) writes.push(offset, this.read(offset, register.bytes))
            offset += register.bytes
        }
        this.flushWrites(writes)
    }

    /** Whether the program has used the Synth since the last reset, so an Undo needs its block. */
    get inUse(): boolean {
        return this.used
    }

    /** Whether any channel's gate is on, as the program last wrote it, heard or not. */
    get gated(): boolean {
        for (let channel = 0; channel < SYNTH_CHANNEL_COUNT; channel++) {
            if (this.mirror[channel * SYNTH_CHANNEL_SIZE + SYNTH_CONTROL] & SYNTH_GATE) return true
        }
        return false
    }

    /** Whether any channel sounds as the program last wrote it: its gate on, its volume above 0. */
    get sounding(): boolean {
        return this.soundingChannels() !== 0
    }

    /** The channels whose gate is on and volume above 0, a bit each. */
    private soundingChannels(): number {
        let channels = 0
        for (let channel = 0; channel < SYNTH_CHANNEL_COUNT; channel++) {
            const base = channel * SYNTH_CHANNEL_SIZE
            if (this.mirror[base + SYNTH_CONTROL] & SYNTH_GATE && this.mirror[base + SYNTH_VOLUME])
                channels |= 1 << channel
        }
        return channels
    }

    /** Build, Stop and the start of a Testcase: zeroed registers and empty Sample memory, as at power-on. */
    reset(): void {
        this.mirror.fill(0)
        this.samples = null
        this.used = false
        this.poking = false
    }

    private upload(bus: SynthBus): void {
        const source = this.read(SYNTH_UPLOAD_SOURCE, 4) >>> 0
        const length = this.read(SYNTH_UPLOAD_LENGTH, 2) || SYNTH_SAMPLE_MEMORY_SIZE
        const destination = this.read(SYNTH_UPLOAD_DESTINATION, 2)
        const copied = Uint8Array.from(bus.read(source, length))
        const samples = (this.samples ??= new Uint8Array(SYNTH_SAMPLE_MEMORY_SIZE))
        const previous = new Uint8Array(copied.length)
        for (let i = 0; i < copied.length; i++) {
            const at = (destination + i) & (SYNTH_SAMPLE_MEMORY_SIZE - 1)
            previous[i] = samples[at]
            samples[at] = copied[i]
        }
        this.host.record(() => {
            for (let i = 0; i < previous.length; i++) {
                samples[(destination + i) & (SYNTH_SAMPLE_MEMORY_SIZE - 1)] = previous[i]
            }
            this.host.send({ type: 'synthUpload', offset: destination, bytes: previous })
        })
        this.host.send({ type: 'synthUpload', offset: destination, bytes: copied })
    }

    private flushWrites(writes: number[]): void {
        if (writes.length === 0) return
        this.host.send({ type: 'synth', writes: writes.splice(0) })
    }

    /** The register a byte of the block belongs to, or null for a reserved byte. */
    private registerAt(address: number): { offset: number; bytes: number } | null {
        if (address < SYNTH_WAVETABLES) {
            const index = CHANNEL_REGISTER_AT[address % SYNTH_CHANNEL_SIZE]
            if (index < 0) return null
            const register = SYNTH_CHANNEL_REGISTERS[index]
            const base = address - (address % SYNTH_CHANNEL_SIZE)
            return { offset: base + register.offset, bytes: register.bytes }
        }
        if (address < SYNTH_UPLOAD_SOURCE) return { offset: address, bytes: 1 }
        if (address < SYNTH_UPLOAD_LENGTH) return { offset: SYNTH_UPLOAD_SOURCE, bytes: 4 }
        if (address < SYNTH_UPLOAD_DESTINATION) return { offset: SYNTH_UPLOAD_LENGTH, bytes: 2 }
        if (address < SYNTH_UPLOAD_START) return { offset: SYNTH_UPLOAD_DESTINATION, bytes: 2 }
        if (address === SYNTH_UPLOAD_START) return { offset: SYNTH_UPLOAD_START, bytes: 1 }
        return null
    }

    /** A register's value from the mirror, in the Target's byte order. */
    private read(offset: number, bytes: number): number {
        let value = 0
        for (let k = 0; k < bytes; k++) {
            const byte = this.mirror[offset + k]
            value += byte * 2 ** (8 * (this.littleEndian ? k : bytes - 1 - k))
        }
        return value
    }
}
