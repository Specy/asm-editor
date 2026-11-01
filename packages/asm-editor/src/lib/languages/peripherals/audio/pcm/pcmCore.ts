/**
 * `/dev/dsp` as the output plays it ([x86-devices.md](../../../../../../../../docs/design/x86-devices.md#devdsps-buffer-and-pacing)):
 * chunks of stereo frames, each due at a time on the output's clock, which the main thread has mapped
 * from the Program time Blink gave them (`programTimeline.ts`). It renders them at the output's
 * sample rate and never answers anything back but whether it still has sound to play.
 *
 * - **Resampling** from the device's rate is linear interpolation, what ALSA's rate plugin does by
 *   default on the guest.
 * - **A stream.** A chunk due where the one before it ends, within `CONTIGUOUS_S`, continues it with
 *   no seam, whatever its rate. Each render quantum compares where the stream is with where it is
 *   due and plays up to `MAX_RATE_CORRECTION` faster or slower to close the gap, a pitch change of
 *   under 9 cents and slow enough not to be heard: this is how the drift between Program time and
 *   the sound card's clock is absorbed over minutes of sound, since the mapping slews by at most
 *   0.1 %.
 * - **Drop and pad.** A stream more than `RESYNC_S` from where it is due starts again: what is late
 *   is dropped, and what is early waits in silence, so a context that was suspended or a mapping that
 *   jumped costs a gap rather than a sound played out of step. Data late on arrival, a program
 *   writing less ahead than the output's latency, loses its late part the same way and stays in step
 *   with Program time, which the program observes.
 * - **Cuts** drop every frame due after their time: an Undo's, a `RESET`'s.
 * - **The mixer's gain** changes at its time, over `GAIN_RAMP_S` so it does not click, and at once
 *   while nothing plays.
 *
 * No Web Audio here: `pcmProcessor.ts` runs it in the worklet, and the tests under node.
 */

/** How far a chunk's start may be from the end of the one before it and still continue its stream. */
export const CONTIGUOUS_S = 0.002
/** How far a stream may be from where it is due before it starts again, dropping or waiting. */
export const RESYNC_S = 0.05
/** The most a stream plays faster or slower to get back to where it is due: 0.5 %. */
export const MAX_RATE_CORRECTION = 0.005
/** How much faster a stream plays per second it is late: a gap closes over about a second. */
const CORRECTION_PER_SECOND = 1
/** How long the gain takes to reach a new level. */
export const GAIN_RAMP_S = 0.005

type Chunk = {
    /** Output time of the first frame, in seconds. */
    readonly start: number
    readonly rate: number
    /** Interleaved stereo. */
    readonly frames: Float32Array
    /** How many frames play; fewer than the array holds once a cut has shortened it. */
    length: number
}

type GainChange = { readonly at: number; readonly left: number; readonly right: number }

export class PcmCore {
    private readonly chunks: Chunk[] = []
    /** Whether the first chunk is playing as a stream; if not, the next frame waits until it is due. */
    private playing = false
    /** Frames into the first chunk: where the stream is, or the first frame not played yet. */
    private position = 0
    private readonly gains: GainChange[] = []
    private left = 1
    private right = 1
    private targetLeft = 1
    private targetRight = 1
    private readonly gainStep: number

    constructor(readonly sampleRate: number) {
        this.gainStep = 1 / (GAIN_RAMP_S * sampleRate)
    }

    /** Queues frames due from `start`, in seconds on the output's clock, at `rate` frames a second. */
    add(start: number, rate: number, frames: Float32Array): void {
        const length = frames.length >> 1
        if (!(rate > 0) || length === 0 || !Number.isFinite(start)) return
        let index = this.chunks.length
        //Blink hands them over in order; anything else after a cut still lands in place
        while (index > 0 && this.chunks[index - 1].start > start) index--
        if (index === 0 && this.chunks.length > 0) {
            this.playing = false
            this.position = 0
        }
        this.chunks.splice(index, 0, { start, rate, frames, length })
    }

    /** Drops every frame due after `after`, and the gain changes after it. */
    cut(after: number): void {
        for (let i = this.chunks.length - 1; i >= 0; i--) {
            const chunk = this.chunks[i]
            if (chunk.start >= after) {
                this.chunks.splice(i, 1)
                if (i === 0) {
                    this.playing = false
                    this.position = 0
                }
                continue
            }
            chunk.length = Math.min(chunk.length, Math.ceil((after - chunk.start) * chunk.rate))
            //the stream was already past the new end
            if (i === 0 && this.playing && this.position >= chunk.length) this.advance()
        }
        for (let i = this.gains.length - 1; i >= 0 && this.gains[i].at > after; i--) {
            this.gains.pop()
        }
    }

    /** The mixer's gain for each side from `at`, 0 to 1. */
    setGain(at: number, left: number, right: number): void {
        if (this.chunks.length === 0 && this.gains.length === 0) {
            this.left = this.targetLeft = left
            this.right = this.targetRight = right
            return
        }
        let index = this.gains.length
        while (index > 0 && this.gains[index - 1].at > at) index--
        this.gains.splice(index, 0, { at, left, right })
    }

    /** Whether there is anything left to play. */
    get busy(): boolean {
        return this.chunks.length > 0
    }

    /**
     * Renders a quantum into `left` and `right` from frame `start` to `end`, replacing what they held;
     * `time` is the output time of frame `start`.
     */
    render(
        left: Float32Array,
        right: Float32Array,
        time: number,
        start = 0,
        end = left.length
    ): void {
        left.fill(0, start, end)
        right.fill(0, start, end)
        const period = 1 / this.sampleRate
        let ratio = this.correction(time)
        for (let i = start; i < end; i++) {
            const t = time + (i - start) * period
            this.stepGain(t)
            if (!this.playing && !this.startStream(t)) continue
            const chunk = this.chunks[0]
            const index = Math.floor(this.position)
            const fraction = this.position - index
            const next = index + 1 < chunk.length ? chunk : this.following(chunk)
            const nextIndex = next === chunk ? index + 1 : 0
            const l0 = chunk.frames[2 * index]
            const r0 = chunk.frames[2 * index + 1]
            const l1 = next ? next.frames[2 * nextIndex] : l0
            const r1 = next ? next.frames[2 * nextIndex + 1] : r0
            left[i] = (l0 + (l1 - l0) * fraction) * this.left
            right[i] = (r0 + (r1 - r0) * fraction) * this.right
            this.position += (chunk.rate / this.sampleRate) * ratio
            if (this.position >= chunk.length) {
                this.advance()
                //a new chunk is due on its own terms
                ratio = this.correction(t + period)
            }
        }
    }

    /**
     * How much faster than its rate the stream plays this quantum: 1 when it is where it is due, and
     * no stream at all once it is further off than `RESYNC_S`, which drops or waits instead.
     */
    private correction(time: number): number {
        if (!this.playing) return 1
        const chunk = this.chunks[0]
        const late = time - (chunk.start + this.position / chunk.rate)
        if (Math.abs(late) > RESYNC_S) {
            this.playing = false
            return 1
        }
        const correction = late * CORRECTION_PER_SECOND
        return 1 + Math.min(MAX_RATE_CORRECTION, Math.max(-MAX_RATE_CORRECTION, correction))
    }

    /**
     * Starts a stream at `time` if the first frame not played yet is due: from the frame due now,
     * which drops what is late. Answers whether one plays.
     */
    private startStream(time: number): boolean {
        while (this.chunks.length > 0) {
            const chunk = this.chunks[0]
            if (time < chunk.start + this.position / chunk.rate) return false
            const due = (time - chunk.start) * chunk.rate
            if (due < chunk.length) {
                this.position = Math.max(this.position, due)
                this.playing = true
                return true
            }
            this.chunks.shift()
            this.position = 0
        }
        return false
    }

    /** The chunk that continues `chunk`'s stream, if the next one is due where it ends. */
    private following(chunk: Chunk): Chunk | undefined {
        const next = this.chunks[1]
        if (next === undefined) return undefined
        const end = chunk.start + chunk.length / chunk.rate
        return Math.abs(next.start - end) <= CONTIGUOUS_S ? next : undefined
    }

    /** Past the end of the first chunk: on into the next if it continues the stream, else stop. */
    private advance(): void {
        const chunk = this.chunks[0]
        const next = this.following(chunk)
        const over = (this.position - chunk.length) / chunk.rate
        this.chunks.shift()
        if (next) {
            this.position = over * next.rate
            if (this.position < next.length) return
        }
        this.playing = false
        this.position = 0
    }

    private stepGain(time: number): void {
        while (this.gains.length > 0 && this.gains[0].at <= time) {
            const change = this.gains.shift()!
            this.targetLeft = change.left
            this.targetRight = change.right
        }
        this.left = approach(this.left, this.targetLeft, this.gainStep)
        this.right = approach(this.right, this.targetRight, this.gainStep)
    }
}

function approach(value: number, target: number, step: number): number {
    if (value < target) return Math.min(target, value + step)
    if (value > target) return Math.max(target, value - step)
    return value
}
