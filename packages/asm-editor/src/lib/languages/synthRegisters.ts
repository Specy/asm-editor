/**
 * The **Synth**'s registers, the one model of them that the device, its Documentation chapter, the
 * coding agent's prompt and `<sim.h>` all read ([the design record](../../../../../docs/design/waveform-sound.md#the-register-map)).
 * Offsets are from the block's base; a register of more than a byte is in the Target's own byte
 * order, so one plain store of its size writes it.
 *
 * Plain data with no imports, so the chip worklet bundles it and `scripts/sim-header` loads it
 * under node.
 */

/** Where the block starts: beside MARS's and RARS's keyboard and display registers, and EASy68K's devices. */
export const SYNTH_BASES = {
    mips: 0xffff0100,
    riscv: 0xffff0100,
    m68k: 0xe00100
} as const

/** The block spans 0x200 bytes from its base. */
export const SYNTH_BLOCK_SIZE = 0x200

/**
 * The chip's clock, 2¹⁶ ticks a second: each tick adds the frequency register to a 16-bit phase
 * accumulator, so a frequency of 440 wraps it 440 times a second.
 */
export const SYNTH_CLOCK_HZ = 65_536

export const SYNTH_CHANNEL_COUNT = 8
export const SYNTH_CHANNEL_SIZE = 0x20

/** Envelope ticks a second: attack, decay and release count in 1/1024 s. */
export const SYNTH_ENVELOPE_TICKS_PER_SECOND = 1024

export type SynthRegister = {
    /** For `<sim.h>` and the Documentation: `SIM_SYNTH_<name>`. */
    readonly name: string
    readonly offset: number
    readonly bytes: 1 | 2 | 4
    readonly description: string
}

/** A channel's registers, at base + channel × 0x20 + offset. 0x14 to 0x1F are reserved. */
export const SYNTH_CHANNEL_REGISTERS = [
    {
        name: 'FREQUENCY',
        offset: 0x00,
        bytes: 2,
        description: 'Frequency in Hz, or samples a second for the sample waveform'
    },
    {
        name: 'PULSE_WIDTH',
        offset: 0x02,
        bytes: 2,
        description: 'Pulse width, 0 to 4095; 2048 is a square wave'
    },
    {
        name: 'ATTACK',
        offset: 0x04,
        bytes: 2,
        description: 'Ticks of 1/1024 s to rise from silence to full'
    },
    {
        name: 'DECAY',
        offset: 0x06,
        bytes: 2,
        description:
            'Ticks of 1/1024 s to fall the whole way from full to silence, stopping at sustain'
    },
    {
        name: 'RELEASE',
        offset: 0x08,
        bytes: 2,
        description:
            'Ticks of 1/1024 s to fall the whole way from full to silence once the gate is off'
    },
    {
        name: 'SAMPLE_START',
        offset: 0x0a,
        bytes: 2,
        description: 'Where the sample waveform starts in Sample memory'
    },
    {
        name: 'SAMPLE_LENGTH',
        offset: 0x0c,
        bytes: 2,
        description: 'How many samples it plays; 0 means all 65,536'
    },
    {
        name: 'LOOP_START',
        offset: 0x0e,
        bytes: 2,
        description: 'Where a looping sample goes back to in Sample memory'
    },
    {
        name: 'CONTROL',
        offset: 0x10,
        bytes: 1,
        description: 'Bit 0 gate: on attacks, off releases; bit 1 loop the sample'
    },
    {
        name: 'WAVEFORM',
        offset: 0x11,
        bytes: 1,
        description: 'Which waveform the channel plays, from the table of waveforms'
    },
    { name: 'VOLUME', offset: 0x12, bytes: 1, description: 'Volume, 0 to 127' },
    {
        name: 'SUSTAIN',
        offset: 0x13,
        bytes: 1,
        description: 'The level the decay stops at while the gate is on, 0 to 127'
    }
] as const satisfies readonly SynthRegister[]

export const SYNTH_FREQUENCY = 0x00
export const SYNTH_PULSE_WIDTH = 0x02
export const SYNTH_ATTACK = 0x04
export const SYNTH_DECAY = 0x06
export const SYNTH_RELEASE = 0x08
export const SYNTH_SAMPLE_START = 0x0a
export const SYNTH_SAMPLE_LENGTH = 0x0c
export const SYNTH_LOOP_START = 0x0e
export const SYNTH_CONTROL = 0x10
export const SYNTH_WAVEFORM = 0x11
export const SYNTH_VOLUME = 0x12
export const SYNTH_SUSTAIN = 0x13

export const SYNTH_GATE = 0x01
export const SYNTH_LOOP = 0x02

/** The waveform register's values, in order: pulse is 0, sample is 6. */
export const SYNTH_WAVEFORMS = [
    'pulse',
    'triangle',
    'sawtooth',
    'sine',
    'noise',
    'wavetable',
    'sample'
] as const

export type SynthWaveform = (typeof SYNTH_WAVEFORMS)[number]

/**
 * Each channel's wavetable: sixteen bytes at base + 0x100 + channel × 0x10, holding 32 four-bit
 * samples, the first of each pair in the byte's high half.
 */
export const SYNTH_WAVETABLES = 0x100
export const SYNTH_WAVETABLE_SIZE = 0x10

/** The upload into Sample memory: a copy taken when its start register is written. */
export const SYNTH_UPLOAD_REGISTERS = [
    {
        name: 'UPLOAD_SOURCE',
        offset: 0x180,
        bytes: 4,
        description: "Where the copy comes from, in the program's memory"
    },
    {
        name: 'UPLOAD_LENGTH',
        offset: 0x184,
        bytes: 2,
        description: 'How many bytes it copies; 0 means 65,536'
    },
    {
        name: 'UPLOAD_DESTINATION',
        offset: 0x186,
        bytes: 2,
        description: 'Where they go in Sample memory'
    },
    {
        name: 'UPLOAD_START',
        offset: 0x188,
        bytes: 1,
        description: 'Any write copies, at that instant'
    }
] as const satisfies readonly SynthRegister[]

export const SYNTH_UPLOAD_SOURCE = 0x180
export const SYNTH_UPLOAD_LENGTH = 0x184
export const SYNTH_UPLOAD_DESTINATION = 0x186
export const SYNTH_UPLOAD_START = 0x188

/** Sample memory: 64 KB of 8-bit signed samples, the Synth's own. */
export const SYNTH_SAMPLE_MEMORY_SIZE = 0x10000
