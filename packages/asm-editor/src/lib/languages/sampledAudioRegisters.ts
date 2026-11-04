/**
 * The **Sampled-audio output**'s registers, the one model of them that the device, its
 * Documentation chapter, the coding agent's prompt and `<sim.h>` all read
 * ([ADR 0075](../../../../../docs/adr/0075-mips-and-risc-v-get-a-midi-port-and-a-sampled-audio-output.md)).
 * Offsets are from the block's base, and every register is a little-endian word, as MARS and RARS
 * are little-endian.
 *
 * A DAC with a FIFO, in the style of the Sound Blaster's or the Amiga's: a program sets the rate,
 * turns it on, and writes samples while Free says there is room; the FIFO plays them at the rate.
 *
 * Plain data with no imports, so `scripts/sim-header` loads it under node.
 */

/** Where the block starts on MIPS and RISC-V: right after the MIDI port. */
export const PCM_BASE = 0xffff0350

/** The block spans 16 bytes from its base. */
export const PCM_BLOCK_SIZE = 0x10

export const PCM_CONTROL = 0x00
export const PCM_RATE = 0x04
export const PCM_FREE = 0x08
export const PCM_DATA = 0x0c

/** Control bit 0: on. Turning it off empties the FIFO. */
export const PCM_ON_BIT = 0x1
/** Control bit 1: stereo, one left and right frame a word; clear, mono, two samples a word. */
export const PCM_STEREO_BIT = 0x2

/** Frames a second, clamped to this range; the Rate register reads back what it was clamped to. */
export const PCM_RATE_MIN = 4_000
export const PCM_RATE_MAX = 48_000
/** The rate at every Build, as `/dev/dsp` opens at: telephone quality. */
export const PCM_RATE_DEFAULT = 8_000

/** How many frames the FIFO holds: about half a second at 16 kHz, 32 KB of 16-bit stereo. */
export const PCM_FIFO_FRAMES = 8_192

export type PcmRegister = {
    /** For `<sim.h>` and the Documentation: `SIM_PCM_<name>`. */
    readonly name: string
    readonly offset: number
    readonly access: 'read' | 'write' | 'read and write'
    readonly description: string
}

export const PCM_REGISTERS = [
    {
        name: 'CONTROL',
        offset: PCM_CONTROL,
        access: 'read and write',
        description:
            'Bit 0 enables output. Clearing it empties the audio buffer. Bit 1 selects stereo. Reads back these two bits. Resets to 0 at Build'
    },
    {
        name: 'RATE',
        offset: PCM_RATE,
        access: 'read and write',
        description:
            'Frames per second, from 4,000 to 48,000. Values outside this range are clamped. Reads back the rate in use. Resets to 8,000 at Build'
    },
    {
        name: 'FREE',
        offset: PCM_FREE,
        access: 'read',
        description:
            'Number of frames the audio buffer can accept, 0 to 8,192. Always even in mono, where each word holds two frames'
    },
    {
        name: 'DATA',
        offset: PCM_DATA,
        access: 'write',
        description:
            'Write a whole word with `sw`. In mono, it holds two signed 16-bit samples, the low half first. In stereo, it holds one frame, left in the low half and right in the high half. Reads 0. Writes are dropped if the buffer has no room or output is off'
    }
] as const satisfies readonly PcmRegister[]

/** What `<sim.h>` is generated from, for `scripts/sim-header` and the drift test alike. */
export function sampledAudioHeaderData() {
    return {
        base: PCM_BASE,
        offsets: Object.fromEntries(
            PCM_REGISTERS.map((register) => [register.name, register.offset])
        ),
        on: PCM_ON_BIT,
        stereo: PCM_STEREO_BIT,
        rateMin: PCM_RATE_MIN,
        rateMax: PCM_RATE_MAX,
        rateDefault: PCM_RATE_DEFAULT,
        fifoFrames: PCM_FIFO_FRAMES
    }
}
