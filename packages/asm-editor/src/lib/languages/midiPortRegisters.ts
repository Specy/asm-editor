/**
 * The **MIDI port**'s registers, the one model of them that the device, its Documentation chapter,
 * the coding agent's prompt and `<sim.h>` all read
 * ([ADR 0075](../../../../../docs/adr/0075-mips-and-risc-v-get-a-midi-port-and-a-sampled-audio-output.md)).
 * Offsets are from the block's base, and every register is a little-endian word, as MARS and RARS
 * are little-endian.
 *
 * It is in the style of the MPU-401's UART mode, always in that mode: a program writes MIDI bytes
 * to Data, and Status says whether the port can take one, at the MPU-401's own bit positions.
 *
 * Plain data with no imports, so `scripts/sim-header` loads it under node.
 */

/** Where the block starts on MIPS and RISC-V: right after the Input controller, 0xFFFF0300 to 0xFFFF033F. */
export const MIDI_PORT_BASE = 0xffff0340

/** The block spans 16 bytes from its base; the sampled-audio output follows it. */
export const MIDI_PORT_BLOCK_SIZE = 0x10

export const MIDI_PORT_DATA = 0x00
/** Read, Status; written, Command: one address, as on the MPU-401. */
export const MIDI_PORT_STATUS = 0x04
export const MIDI_PORT_COMMAND = 0x04

/** Status bit 6: the port's buffer is full, and a byte written now is dropped. */
export const MIDI_PORT_BUSY_BIT = 0x40
/**
 * Status bit 7: no MIDI byte to read, always set, since the port has no MIDI in. It is also what
 * tells the port is there: in MARS and RARS the address is plain memory, which reads 0.
 */
export const MIDI_PORT_NO_INPUT_BIT = 0x80

/** The Command written to reset the port: its buffer is emptied and every note it holds ends. */
export const MIDI_PORT_RESET = 0xff
/** The MPU-401's "enter UART mode", accepted and doing nothing, since the port is always in it. */
export const MIDI_PORT_UART_MODE = 0x3f

/** How many bytes wait in the port before it is busy: a page, as x86's raw MIDI port has. */
export const MIDI_PORT_BUFFER_BYTES = 4096

/** MIDI's speed: 31,250 bits a second, ten bits a byte with its start and stop bits. */
export const MIDI_BAUD = 31_250
export const MIDI_BITS_PER_BYTE = 10
/** How long one byte takes to leave the port, in milliseconds: 0.32. */
export const MIDI_BYTE_MS = (MIDI_BITS_PER_BYTE * 1000) / MIDI_BAUD

export type MidiPortRegister = {
    /** For `<sim.h>` and the Documentation: `SIM_MIDI_<name>`. */
    readonly name: string
    readonly offset: number
    readonly access: 'read' | 'write'
    readonly description: string
}

export const MIDI_PORT_REGISTERS = [
    {
        name: 'DATA',
        offset: MIDI_PORT_DATA,
        access: 'write',
        description:
            'A MIDI byte to send, in the low byte of the store (`sb` or `sw`); reads 0. A byte written while the port is busy is dropped'
    },
    {
        name: 'STATUS',
        offset: MIDI_PORT_STATUS,
        access: 'read',
        description:
            'Bit 6 is set while the port is busy, its buffer full; bit 7 is always set, as the port has no MIDI in. Reads `0x80` when a byte can be sent'
    },
    {
        name: 'COMMAND',
        offset: MIDI_PORT_COMMAND,
        access: 'write',
        description:
            'The same address as Status. `0xFF` resets the port: its buffer is emptied and every note ends. `0x3F` is accepted and does nothing; other values are ignored'
    }
] as const satisfies readonly MidiPortRegister[]

/** What `<sim.h>` is generated from, for `scripts/sim-header` and the drift test alike. */
export function midiPortHeaderData() {
    return {
        base: MIDI_PORT_BASE,
        offsets: { DATA: MIDI_PORT_DATA, STATUS: MIDI_PORT_STATUS, COMMAND: MIDI_PORT_COMMAND },
        busy: MIDI_PORT_BUSY_BIT,
        noInput: MIDI_PORT_NO_INPUT_BIT,
        reset: MIDI_PORT_RESET,
        uartMode: MIDI_PORT_UART_MODE,
        bufferBytes: MIDI_PORT_BUFFER_BYTES
    }
}
