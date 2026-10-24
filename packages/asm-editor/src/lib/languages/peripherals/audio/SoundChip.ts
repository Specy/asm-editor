import type { ChipHost } from './Synth'

/**
 * The Z80's **Sound chip** as a program sees it: the MSX's AY-3-8910 behind its three ports
 * ([the design record](../../../../../../../docs/design/waveform-sound.md#the-sound-chip-on-the-z80)).
 * The program selects a register through one port and writes or reads it through the others; this
 * holds the registers, answers the reads as the chip does, journals every change for Undo and hands
 * each write to the chip in the output. Unlike the Synth's, its registers are nowhere in the Core's
 * memory, so in a Testcase it still keeps them, and a Testcase reads back what an interactive run
 * would.
 */

/** The bits each register keeps, which is what a read gives back: 12-bit periods, 5-bit volumes. */
export const SOUND_CHIP_REGISTER_MASKS = [
    0xff, 0x0f, 0xff, 0x0f, 0xff, 0x0f, 0x1f, 0xff, 0x1f, 0x1f, 0x1f, 0xff, 0xff, 0x0f
] as const

/** Registers 0 to 13 make sound; 14 and 15 are the I/O ports the MSX wires to its joysticks. */
const SOUND_REGISTERS = SOUND_CHIP_REGISTER_MASKS.length
const VOLUMES = [8, 9, 10]
/** What a read gives where nothing answers: the I/O ports, and a register past 15. */
const NOTHING = 0xff

/** The envelope shape register, whose every write restarts the envelope. */
const ENVELOPE_SHAPE = 13

/**
 * The same writes, folded to what one instant of the chip needs, as `compactSynthWrites` does for
 * the Synth: the last value of each register, and the envelope shape last, once, if it was written
 * at all, since any number of restarts in one instant is one.
 */
export function compactSoundChipWrites(writes: readonly number[]): number[] {
    const values = new Map<number, number>()
    for (let i = 0; i < writes.length; i += 2) {
        values.delete(writes[i])
        values.set(writes[i], writes[i + 1])
    }
    const shape = values.get(ENVELOPE_SHAPE)
    values.delete(ENVELOPE_SHAPE)
    const compact: number[] = []
    for (const [register, value] of values) compact.push(register, value)
    if (shape !== undefined) compact.push(ENVELOPE_SHAPE, shape)
    return compact
}

export class SoundChip {
    private readonly registers = new Uint8Array(SOUND_REGISTERS)
    private selected = 0
    /** Whether the program has written a register since the last reset. */
    private used = false
    /** Set when an Undo puts a register back, until the chip is told. */
    private rewound = false

    constructor(private readonly host: ChipHost) {}

    /** The register select port: which register the next write or read reaches. */
    select(value: number): void {
        value &= 0xff
        const previous = this.selected
        if (previous === value) return
        this.host.record(() => (this.selected = previous))
        this.selected = value
    }

    /** The write port: the selected register takes the value, keeping its own bits. */
    write(value: number): void {
        const register = this.selected
        if (register >= SOUND_REGISTERS) return
        const masked = value & SOUND_CHIP_REGISTER_MASKS[register]
        const previous = this.registers[register]
        if (previous !== masked) {
            this.host.record(() => {
                this.registers[register] = previous
                this.rewound = true
            })
            this.registers[register] = masked
        }
        this.used = true
        if (VOLUMES.includes(register) && masked !== 0 && previous === 0) this.host.started()
        //writing the envelope shape restarts the envelope even when it is the same shape
        if (!this.host.silent) this.host.send({ type: 'soundChip', writes: [register, masked] })
    }

    /** The read port: the selected register as the chip holds it. */
    read(): number {
        return this.selected < SOUND_REGISTERS ? this.registers[this.selected] : NOTHING
    }

    /**
     * After an Undo: the chip plays from the registers again when the Undo put one back, or when
     * `all` says the output released the chip since.
     */
    resync(all: boolean): void {
        if (this.host.silent || !this.used || !(this.rewound || all)) return
        this.rewound = false
        this.host.send({ type: 'soundChipLoad', registers: Array.from(this.registers) })
    }

    /** Whether any channel has a volume, or follows the envelope, as the program last wrote it. */
    get voiced(): boolean {
        return VOLUMES.some((register) => this.registers[register] !== 0)
    }

    /** Build, Stop and the start of a Testcase: every register 0, as at power-on. */
    reset(): void {
        this.registers.fill(0)
        this.selected = 0
        this.used = false
        this.rewound = false
    }
}
