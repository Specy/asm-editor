/**
 * Where x86's sound timeline meets the output's clock
 * ([x86-devices.md](../../../../../../../docs/design/x86-devices.md#devdsps-buffer-and-pacing)):
 * Blink's devices drain on **Program time**, and the output plays what they played a fixed latency
 * behind, on the `AudioContext`'s time, so that what a slice made has reached the audio thread before
 * it is due. Every device of an output maps through the same timeline, which keeps `/dev/dsp`, the
 * MIDI port and the PC speaker in step with each other.
 *
 * The two clocks drift apart: Program time is the host's monotonic clock and the context's is the
 * sound card's sample clock, which disagree by up to a few hundred parts per million, tens of
 * milliseconds over minutes of sound. Each batch reads both at once (`observe`); the mapping follows
 * their difference at no more than `MAX_SLEW`, a millisecond a second, so what it schedules moves
 * too slowly to be heard and the jitter of a single reading averages out. It jumps only when the
 * difference is more than drift explains, `REANCHOR_S`: the first batch, a context that was
 * suspended while the program ran on, a new run whose Program time started again from zero. The PCM
 * worklet absorbs the slewing of a continuous stream by playing it a little faster or slower
 * (`pcm/pcmCore.ts`).
 *
 * Plain TypeScript: the tests run it under node.
 */

/** How far behind Program time the output plays: a compute slice and the trip to the audio thread. */
export const TIMELINE_LATENCY_S = 0.1
/** A difference between the clocks larger than drift makes in one batch: the mapping jumps to it. */
export const REANCHOR_S = 0.05
/** How fast the mapping follows the drift: seconds of change per second of Program time. */
export const MAX_SLEW = 0.001

export class ProgramTimeline {
    /** Output time minus Program time, in seconds; null until the first observation. */
    private offset: number | null = null
    /** Program time of the last observation, in milliseconds. */
    private observedAt = 0

    constructor(private readonly latency = TIMELINE_LATENCY_S) {}

    /** Program time in milliseconds and the output's time in seconds, read at the same moment. */
    observe(programMs: number, outputTime: number): void {
        const measured = outputTime + this.latency - programMs / 1000
        const elapsed = (programMs - this.observedAt) / 1000
        this.observedAt = programMs
        if (this.offset === null || elapsed < 0 || Math.abs(measured - this.offset) > REANCHOR_S) {
            this.offset = measured
            return
        }
        const allowed = MAX_SLEW * elapsed
        this.offset += Math.min(allowed, Math.max(-allowed, measured - this.offset))
    }

    /** The output time, in seconds, a moment of Program time in milliseconds plays at. */
    toOutput(programMs: number): number {
        return programMs / 1000 + (this.offset ?? 0)
    }

    /** Forgets the mapping, for the next run's Program time. */
    reset(): void {
        this.offset = null
        this.observedAt = 0
    }
}
