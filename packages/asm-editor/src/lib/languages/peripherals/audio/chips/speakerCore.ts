/**
 * x86's PC speaker as the chip worklet plays it
 * ([x86-devices.md](../../../../../../../../docs/design/x86-devices.md#the-pc-speaker)): the
 * timer's square wave, a pulse at half width, at the frequency Blink hands over with the timer's
 * quantisation already applied, or nothing at 0 Hz. Tones arrive with the output time they start at,
 * which the main thread mapped from Program time, and each takes over at its own frame; one already
 * due when it arrives takes over at once, since the speaker is a state rather than a recording.
 *
 * The square is band-limited at its edges (polyBLEP), so a high tone does not fold back into the
 * audible band as a whistle the analog speaker never makes; the phase runs on across a change of
 * frequency, as the timer's counter does.
 *
 * No Web Audio here: the worklet renders it, and the tests run it under node.
 */

/** As loud as a Synth channel at full volume, so the two sit together. */
const GAIN = 0.25

type Tone = { readonly at: number; readonly hz: number }

export class SpeakerCore {
    private hz = 0
    /** Where the square is in its period, 0 to 1. */
    private phase = 0
    private readonly tones: Tone[] = []

    constructor(readonly sampleRate: number) {}

    /** The tone from `at`, in seconds on the output's clock; 0 is silence. */
    schedule(at: number, hz: number): void {
        let index = this.tones.length
        while (index > 0 && this.tones[index - 1].at > at) index--
        this.tones.splice(index, 0, { at, hz: Number.isFinite(hz) && hz > 0 ? hz : 0 })
    }

    /** Drops the tones due after `after`. */
    cut(after: number): void {
        while (this.tones.length > 0 && this.tones[this.tones.length - 1].at > after) {
            this.tones.pop()
        }
    }

    /** Silent at once, with nothing still to come: a program's own end on another Target's chips. */
    silence(): void {
        this.hz = 0
        this.tones.length = 0
    }

    /** Whether it sounds. */
    get audible(): boolean {
        return this.hz > 0
    }

    /** Whether it sounds or has a tone still to come, which keeps the worklet rendering. */
    get active(): boolean {
        return this.hz > 0 || this.tones.length > 0
    }

    /**
     * Adds the speaker into `out` from `start` to `end`; `time` is the output time of frame `start`.
     */
    render(out: Float32Array, time: number, start = 0, end = out.length): void {
        const period = 1 / this.sampleRate
        for (let i = start; i < end; i++) {
            const t = time + (i - start) * period
            while (this.tones.length > 0 && this.tones[0].at <= t) this.hz = this.tones.shift()!.hz
            if (this.hz === 0) continue
            const step = this.hz / this.sampleRate
            //above half the output's rate the tone cannot be rendered, and nobody would hear it
            if (step >= 0.5) continue
            const phase = this.phase
            let value = phase < 0.5 ? 1 : -1
            value += polyBlep(phase, step)
            value -= polyBlep((phase + 0.5) % 1, step)
            out[i] += value * GAIN
            this.phase = (phase + step) % 1
        }
    }
}

/** The correction that rounds off a step of 2 at phase 0 over one sample on each side. */
function polyBlep(phase: number, step: number): number {
    if (phase < step) {
        const x = phase / step
        return x + x - x * x - 1
    }
    if (phase > 1 - step) {
        const x = (phase - 1) / step
        return x * x + x + x + 1
    }
    return 0
}
