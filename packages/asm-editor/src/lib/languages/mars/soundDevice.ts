import type { Audio } from '#lib/languages/peripherals/audio/Audio.ts'

/**
 * What the **MIDI port** and the **Sampled-audio output** of MIPS and RISC-V share
 * ([ADR 0075](../../../../../../docs/adr/0075-mips-and-risc-v-get-a-midi-port-and-a-sampled-audio-output.md)):
 * the bus to the Core's memory, the clock they drain on, and the Audio they play through.
 */

/** Where a sound device writes its registers and reads what a program stored: the Core, through `MarsDevices`. */
export type SoundBus = {
    /** One word of memory, unjournaled and unobserved: the Core's `setPeripheralWord`. */
    push(address: number, value: number): void
    /** One word as memory holds it, without telling any observer. */
    readWord(address: number): number
}

/** Program time, which a Testcase makes virtual; read at each use, since a Testcase swaps it. */
export type SoundClock = {
    now(): number
    readonly isVirtual: boolean
    /** On a virtual clock, moves it on at once; the devices use it for nothing else. */
    wait(ms: number): Promise<void>
}

export type SoundDeviceHost = {
    clock(): SoundClock
    /** The Audio the device plays through, read at each use: a Testcase swaps in a silent one. */
    audio(): Audio
}

/**
 * A fraction of a byte or a frame that a drain's count may fall short by, from the rounding of
 * Program time: without it a virtual clock moved to the exact moment a byte leaves could find it
 * still leaving, and move again by nothing.
 */
export const DRAIN_EPSILON = 1e-6

/** Whether a store of `length` bytes at `address` touches any of the `size` bytes from `register`. */
export function touches(address: number, length: number, register: number, size: number): boolean {
    return address < register + size && address + length > register
}

/**
 * Moves a Testcase's virtual clock on to `target`, a moment a device drains at, so that a program
 * polling the device while it is full never spins: the clock moves only on waits
 * ([ADR 0010](../../../../../../docs/adr/0010-program-time-without-clock-pacing.md)), and this is one.
 */
export function waitVirtually(clock: SoundClock, target: number): void {
    const now = clock.now()
    //a virtual wait is over as soon as it is asked for: the promise is already settled
    if (target > now) void clock.wait(target - now)
}
