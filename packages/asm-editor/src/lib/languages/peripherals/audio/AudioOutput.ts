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

/**
 * What has to be ready before something can sound: the synthesizer and its bank, a decoded Sound, or
 * the synthesizer of a MIDI port, x86's raw one or the MIDI port of MIPS and RISC-V.
 */
export type AudioNeed =
    | { kind: 'synthesizer' }
    | { kind: 'sound'; sound: SoundData }
    | { kind: 'midiPort' }

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
    | TimelineCommand

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
    /**
     * x86's PC speaker from `at`, in seconds on the output's clock: a square wave at `hz`, 0 silent.
     * Only the output makes these, from the timeline's `tone`.
     */
    | { type: 'speaker'; at: number; hz: number }
    /** Drops the PC speaker's tones due after `after`, in seconds on the output's clock. */
    | { type: 'speakerCut'; after: number }

/**
 * Which of the timeline's devices a cut drops from, every one when a cut names none: the samples
 * (`/dev/dsp`, the Sampled-audio output), a MIDI port, or x86's PC speaker.
 */
export type TimelineDevice = 'dsp' | 'midi' | 'speaker'

/**
 * The streamed sound: a timeline on **Program time**, in milliseconds
 * ([x86-devices-plan.md](../../../../../../../docs/design/x86-devices-plan.md), decision 10). The
 * device decides when each thing sounds, as it drains on Program time, Blink for x86 and
 * `MarsDevices` for the MIDI port and the Sampled-audio output of MIPS and RISC-V; the output plays
 * it then, a fixed latency behind on its own clock, and never decides anything.
 */
export type TimelineCommand =
    /** Program time as the batch leaves, which the output maps its clock against; first in any batch with the others. */
    | { type: 'programTime'; now: number }
    /** Samples heard from `start`: stereo frames, interleaved, `rate` of them a second. */
    | { type: 'pcm'; start: number; rate: number; frames: Float32Array }
    /** The samples' gain from `at`, x86's mixer levels VOLUME × PCM for each side, 0 to 1. */
    | { type: 'pcmGain'; at: number; left: number; right: number }
    /** One complete message leaving a MIDI port at `at`, a SysEx with its F0 and F7. */
    | { type: 'midi'; at: number; message: Uint8Array }
    /** The PC speaker's tone from `at`, in Hz; 0 is silence. */
    | { type: 'tone'; at: number; hz: number }
    /** Everything due after `after` dropped, on `device` or on all of them: an Undo, a RESET, a DROP. */
    | { type: 'cut'; after: number; device?: TimelineDevice }
    /**
     * The program ended at `at`: the PC speaker falls silent, and every MIDI note still held is
     * released once what the port had queued has gone out. The samples play out.
     */
    | { type: 'programEnd'; at: number }

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
