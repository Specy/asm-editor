import { describe, expect, it } from 'vite-plus/test'
import { risingCrossings } from './chipTestSignals'
import { SpeakerCore } from './speakerCore'

const RATE = 48_000

/** Renders `seconds` of the output clock from `from`, in render quanta as the worklet does. */
function render(speaker: SpeakerCore, seconds: number, from = 0): Float32Array {
    const out = new Float32Array(Math.round(RATE * seconds))
    for (let start = 0; start < out.length; start += 128) {
        speaker.render(out, from + start / RATE, start, Math.min(out.length, start + 128))
    }
    return out
}

const at = (seconds: number) => Math.round(seconds * RATE)

describe('the PC speaker', () => {
    it('is silent until a tone is due, then plays a square at its frequency', () => {
        const speaker = new SpeakerCore(RATE)
        //1193182 ÷ ⌊1193182 ÷ 440⌋, as the timer makes 440 Hz
        speaker.schedule(0.5, 440.2885)
        const out = render(speaker, 1.5)
        expect(out.subarray(0, at(0.5)).every((value) => value === 0)).toBe(true)
        expect(risingCrossings(out.subarray(at(0.5), at(1.5)))).toBeCloseTo(440, -1)
        //a pulse at half width: as long above zero as below
        const half = out.subarray(at(0.5), at(1.5))
        const above = half.filter((value) => value > 0).length / half.length
        expect(above).toBeCloseTo(0.5, 2)
        expect(speaker.audible).toBe(true)
    })

    it('changes tone and falls silent at the frames they are due', () => {
        const speaker = new SpeakerCore(RATE)
        speaker.schedule(0, 1000)
        speaker.schedule(0.25, 2000)
        speaker.schedule(0.5, 0)
        const out = render(speaker, 0.75)
        expect(risingCrossings(out.subarray(0, at(0.25)))).toBeCloseTo(250, -1)
        expect(risingCrossings(out.subarray(at(0.25), at(0.5)))).toBeCloseTo(500, -1)
        expect(out.subarray(at(0.5) + 1).every((value) => value === 0)).toBe(true)
        expect(speaker.active).toBe(false)
    })

    it('takes a tone already due at once', () => {
        const speaker = new SpeakerCore(RATE)
        render(speaker, 0.1)
        speaker.schedule(0.05, 1000)
        expect(render(speaker, 0.01, 0.1).some((value) => value !== 0)).toBe(true)
    })

    it('drops the tones a cut drops, and none before it', () => {
        const speaker = new SpeakerCore(RATE)
        speaker.schedule(0.1, 1000)
        speaker.schedule(0.3, 0)
        speaker.cut(0.2)
        const out = render(speaker, 0.5)
        expect(out[at(0.45)]).not.toBe(0)
        speaker.silence()
        expect(render(speaker, 0.01, 0.5).every((value) => value === 0)).toBe(true)
    })

    it('renders nothing above half the output rate', () => {
        const high = new SpeakerCore(RATE)
        high.schedule(0, 30_000)
        expect(render(high, 0.01).every((value) => value === 0)).toBe(true)
    })
})
