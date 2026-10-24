/**
 * Where the **Audio** Peripheral's Notes and Sounds become sound. `Audio` decides everything a
 * program can observe and hands its output what to start and stop, in batches, at the moments the
 * Screen flushes ([the plan](../../../../../../../docs/design/audio-plan.md), decision 6); the output
 * only makes noise. Under node, in a Testcase and before a browser output is attached, the silent one
 * stands in, so nothing here may depend on an output to answer a program.
 */

/** The bytes of a Sound File, numbered so an output can keep what it decoded from them. */
export type SoundData = {
    readonly id: number
    readonly kind: 'wav' | 'midi'
    readonly bytes: Uint8Array
}

/** What has to be ready before something can sound: the synthesizer and its bank, or a decoded Sound. */
export type AudioNeed = { kind: 'synthesizer' } | { kind: 'sound'; sound: SoundData }

export type AudioCommand =
    | {
          type: 'note'
          voice: number
          pitch: number
          instrument: number
          volume: number
          durationMs: number
      }
    | { type: 'sound'; voice: number; sound: SoundData; loop: boolean }
    | { type: 'stop'; voice: number }
    | { type: 'stopAll' }
    | ChipCommand

/**
 * What the **Synth** and the **Sound chip** are told, in the order the program did it. A chip is a
 * state, not a recording, so an output that is not ready yet keeps these and plays them once it is,
 * where a Note sent too early is dropped.
 */
export type ChipCommand =
    /** Register writes as pairs of an offset in the block and its value, decoded from the Target's byte order. */
    | { type: 'synth'; writes: number[] }
    /** Bytes copied into Sample memory from `offset`, wrapping past its end. */
    | { type: 'synthUpload'; offset: number; bytes: Uint8Array }
    /** Register writes as pairs of a register number and its value. */
    | { type: 'soundChip'; writes: number[] }
    /** Registers 0 to 13 as an Undo left them; only those that differ are written again. */
    | { type: 'soundChipLoad'; registers: number[] }
    /** A program's own end: every Synth gate off and every Sound chip volume to 0. */
    | { type: 'releaseChips' }

export interface AudioOutput {
    /**
     * Starts loading what `need` asks for and answers the promise of it, or null when it is ready
     * already. A rejected promise means it never will be: the program goes on without the sound.
     */
    prepare(need: AudioNeed): Promise<void> | null
    /** Starts and stops sounds, in order, as soon as it can. */
    send(commands: readonly AudioCommand[]): void
}

export class SilentAudioOutput implements AudioOutput {
    prepare(): null {
        return null
    }

    send(): void {}
}

/** For tests: keeps every batch, and holds `prepare` open until the test settles it. */
export class RecordingAudioOutput implements AudioOutput {
    readonly batches: AudioCommand[][] = []
    readonly prepared: AudioNeed[] = []
    private pending: { resolve: () => void; reject: (error: Error) => void } | null = null
    /** Whether `prepare` makes the caller wait; false answers null, as a loaded output does. */
    holdPrepare = false

    prepare(need: AudioNeed): Promise<void> | null {
        this.prepared.push(need)
        if (!this.holdPrepare) return null
        return new Promise((resolve, reject) => (this.pending = { resolve, reject }))
    }

    send(commands: readonly AudioCommand[]): void {
        this.batches.push([...commands])
    }

    /** Settles the held `prepare`, or rejects it with `error`. */
    settle(error?: Error): void {
        const pending = this.pending
        this.pending = null
        if (error) pending?.reject(error)
        else pending?.resolve()
    }

    get commands(): AudioCommand[] {
        return this.batches.flat()
    }
}
