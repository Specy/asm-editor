import { describe, expect, it } from 'vite-plus/test'
import { risingCrossings } from '../chips/chipTestSignals'
import { CONTIGUOUS_S, GAIN_RAMP_S, MAX_RATE_CORRECTION, PcmCore } from './pcmCore'

const RATE = 48_000

/** Renders `seconds` of the output clock from 0, in render quanta as the worklet does. */
function render(core: PcmCore, seconds: number, from = 0) {
    const length = Math.round(RATE * seconds)
    const left = new Float32Array(length)
    const right = new Float32Array(length)
    for (let start = 0; start < length; start += 128) {
        const end = Math.min(length, start + 128)
        core.render(left, right, from + start / RATE, start, end)
    }
    return { left, right }
}

/** Interleaved stereo frames, `left(i)` and `right(i)` for frame i. */
function frames(count: number, left: (i: number) => number, right = left): Float32Array {
    const out = new Float32Array(count * 2)
    for (let i = 0; i < count; i++) {
        out[2 * i] = left(i)
        out[2 * i + 1] = right(i)
    }
    return out
}

const at = (seconds: number) => Math.round(seconds * RATE)
const constant = (value: number) => () => value

describe('the PCM stream', () => {
    it('plays a chunk from its time, resampled to the output rate', () => {
        const core = new PcmCore(RATE)
        //one second of a 1 kHz sine at 8 kHz, due 0.25 s in
        core.add(
            0.25,
            8000,
            frames(8000, (i) => Math.sin((2 * Math.PI * 1000 * i) / 8000))
        )
        const { left } = render(core, 1.5)
        expect(left.subarray(0, at(0.25)).every((value) => value === 0)).toBe(true)
        expect(left[at(0.25) + 12]).not.toBe(0)
        expect(risingCrossings(left.subarray(at(0.25), at(1.25)))).toBeCloseTo(1000, -1)
        expect(left.subarray(at(1.26)).every((value) => value === 0)).toBe(true)
        expect(core.busy).toBe(false)
    })

    it('keeps the two sides apart', () => {
        const core = new PcmCore(RATE)
        core.add(0, 8000, frames(800, constant(0.5), constant(-0.25)))
        const { left, right } = render(core, 0.05)
        expect(left[at(0.05) - 10]).toBeCloseTo(0.5)
        expect(right[at(0.05) - 10]).toBeCloseTo(-0.25)
    })

    it('continues a stream across chunks, and across a change of rate, with no seam', () => {
        const core = new PcmCore(RATE)
        core.add(0, 8000, frames(800, constant(0.5)))
        core.add(0.1, 8000, frames(800, constant(0.5)))
        //due a sample's worth late, as the mapping's slewing moves a chunk
        core.add(0.2 + 1e-4, 22_050, frames(2205, constant(0.5)))
        const { left } = render(core, 0.3)
        const played = left.subarray(0, at(0.3) - 48)
        expect(played.every((value) => Math.abs(value - 0.5) < 1e-6)).toBe(true)
    })

    it('absorbs a drift between the clocks by playing slightly faster, never dropping a sample', () => {
        const core = new PcmCore(RATE)
        //the mapping moves each 50 ms chunk 50 µs later: a clock 0.1 % slower, a minute of it
        let start = 0
        let total = 0
        for (let chunk = 0; chunk < 1200; chunk++) {
            core.add(
                start,
                8000,
                frames(400, (i) => ((chunk * 400 + i) % 2 ? 0.5 : 0.25))
            )
            start += 0.05 + 5e-5
            total += 400
        }
        expect(1e-5 + 5e-5).toBeLessThan(CONTIGUOUS_S)
        const { left } = render(core, start + 0.1)
        const sounding = left.filter((value) => value !== 0).length
        //never a gap, the stream stretched to end where it was due, within a few ms
        let last = left.length - 1
        while (last >= 0 && left[last] === 0) last--
        expect(sounding).toBe(last + 1)
        const end = last / RATE
        expect(Math.abs(end - start)).toBeLessThan(0.005)
        expect(total).toBe(480_000)
        //and never faster than the correction allows
        expect(end).toBeGreaterThan((total / 8000) * (1 - MAX_RATE_CORRECTION))
    })

    it('drops what arrives late, so it stays in step with Program time', () => {
        const core = new PcmCore(RATE)
        render(core, 0.5)
        //due from 0.4 s, handed over at 0.5 s: the frame due at 0.5 s plays first
        core.add(
            0.4,
            8000,
            frames(8000, (i) => i / 8000)
        )
        const { left } = render(core, 0.01, 0.5)
        expect(left[0]).toBeCloseTo(0.1, 3)
    })

    it('waits out a gap the program left, and starts again on time', () => {
        const core = new PcmCore(RATE)
        core.add(0, 8000, frames(800, constant(0.5)))
        //30 ms after the first ends: an underrun, which plays silence
        core.add(0.13, 8000, frames(800, constant(0.5)))
        const { left } = render(core, 0.3)
        expect(left[at(0.115)]).toBe(0)
        expect(left[at(0.128)]).toBe(0)
        expect(left[at(0.131)]).toBeCloseTo(0.5)
    })

    it('starts again where it is due when the mapping jumped', () => {
        const core = new PcmCore(RATE)
        core.add(
            0,
            8000,
            frames(8000, (i) => i / 8000)
        )
        render(core, 0.1)
        //a context suspended for 200 ms: the stream is that late when it resumes
        const { left } = render(core, 0.01, 0.3)
        expect(left[1]).toBeCloseTo(0.3, 2)
    })
})

describe('cuts', () => {
    it('drops every frame due after the cut, a chunk across it shortened', () => {
        const core = new PcmCore(RATE)
        core.add(0, 8000, frames(800, constant(0.5)))
        core.add(0.1, 8000, frames(800, constant(0.5)))
        core.add(0.2, 8000, frames(800, constant(0.5)))
        core.cut(0.15)
        const { left } = render(core, 0.3)
        expect(left[at(0.14)]).toBeCloseTo(0.5)
        expect(left.subarray(at(0.151)).every((value) => value === 0)).toBe(true)
        expect(core.busy).toBe(false)
    })

    it('ends a stream already past the cut at once', () => {
        const core = new PcmCore(RATE)
        core.add(0, 8000, frames(8000, constant(0.5)))
        render(core, 0.2)
        core.cut(0.1)
        expect(render(core, 0.01, 0.2).left.every((value) => value === 0)).toBe(true)
    })

    it('keeps what is due before the cut, and takes what comes after it', () => {
        const core = new PcmCore(RATE)
        core.add(0, 8000, frames(8000, constant(0.5)))
        core.cut(0.5)
        core.add(0.5, 8000, frames(800, constant(-0.5)))
        const { left } = render(core, 0.7)
        expect(left[at(0.45)]).toBeCloseTo(0.5)
        expect(left[at(0.55)]).toBeCloseTo(-0.5)
    })
})

describe("the mixer's gain", () => {
    it('applies at once while nothing plays, each side on its own', () => {
        const core = new PcmCore(RATE)
        core.setGain(0, 0.5, 0.25)
        core.add(0, 8000, frames(800, constant(1)))
        const { left, right } = render(core, 0.05)
        expect(left[0]).toBeCloseTo(0.5)
        expect(right[0]).toBeCloseTo(0.25)
    })

    it('changes at its time, over a few milliseconds so it does not click', () => {
        const core = new PcmCore(RATE)
        core.add(0, 8000, frames(8000, constant(1)))
        core.setGain(0.5, 0, 0)
        const { left } = render(core, 0.6)
        expect(left[at(0.49)]).toBeCloseTo(1)
        expect(left[at(0.5 + GAIN_RAMP_S / 2)]).toBeGreaterThan(0.3)
        expect(left[at(0.5 + GAIN_RAMP_S / 2)]).toBeLessThan(0.7)
        expect(left[at(0.5 + GAIN_RAMP_S) + 2]).toBe(0)
    })

    it('drops the changes a cut drops', () => {
        const core = new PcmCore(RATE)
        core.add(0, 8000, frames(8000, constant(1)))
        core.setGain(0.5, 0, 0)
        core.cut(0.4)
        core.add(0.4, 8000, frames(8000, constant(1)))
        expect(render(core, 0.7).left[at(0.6)]).toBeCloseTo(1)
    })
})
