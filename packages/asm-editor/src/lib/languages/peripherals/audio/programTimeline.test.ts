import { describe, expect, it } from 'vite-plus/test'
import { MAX_SLEW, ProgramTimeline, REANCHOR_S, TIMELINE_LATENCY_S } from './programTimeline'

describe('the Program time timeline', () => {
    it('plays Program time a fixed latency behind, on the output clock', () => {
        const timeline = new ProgramTimeline()
        timeline.observe(2000, 10)
        expect(timeline.toOutput(2000)).toBeCloseTo(10 + TIMELINE_LATENCY_S, 9)
        expect(timeline.toOutput(2500)).toBeCloseTo(10.5 + TIMELINE_LATENCY_S, 9)
    })

    it('follows a drift no faster than its slew, so what it schedules never jumps', () => {
        const timeline = new ProgramTimeline()
        timeline.observe(0, 0)
        //the sound card runs 0.5 % fast: after 10 s of Program time it is 50 ms ahead
        for (let ms = 100; ms <= 10_000; ms += 100) {
            const before = timeline.toOutput(ms)
            timeline.observe(ms, (ms / 1000) * 1.005)
            expect(Math.abs(timeline.toOutput(ms) - before)).toBeLessThanOrEqual(
                MAX_SLEW * 0.1 + 1e-12
            )
        }
        //it has followed 10 ms of the 50 at a millisecond a second
        expect(timeline.toOutput(10_000) - (10 + TIMELINE_LATENCY_S)).toBeCloseTo(0.01, 6)
    })

    it('catches a slow drift up, and averages the jitter of single readings', () => {
        const timeline = new ProgramTimeline()
        timeline.observe(0, 0)
        //100 parts per million, read with up to 3 ms of jitter
        for (let ms = 50; ms <= 60_000; ms += 50) {
            const jitter = ((ms / 50) % 3) * 0.0015 - 0.0015
            timeline.observe(ms, (ms / 1000) * 1.0001 + jitter)
        }
        expect(
            Math.abs(timeline.toOutput(60_000) - (60 * 1.0001 + TIMELINE_LATENCY_S))
        ).toBeLessThan(0.0005)
    })

    it('jumps when the clocks differ by more than drift explains: a suspended context, a new run', () => {
        const timeline = new ProgramTimeline()
        timeline.observe(1000, 5)
        //the context was suspended for a second while the program ran on
        timeline.observe(2000, 5 + REANCHOR_S / 10)
        expect(timeline.toOutput(2000)).toBeCloseTo(5 + REANCHOR_S / 10 + TIMELINE_LATENCY_S, 9)
        //a new run's Program time starts again from zero
        timeline.observe(0, 8)
        expect(timeline.toOutput(0)).toBeCloseTo(8 + TIMELINE_LATENCY_S, 9)
    })

    it('starts again after a reset', () => {
        const timeline = new ProgramTimeline()
        timeline.observe(5000, 1)
        timeline.reset()
        timeline.observe(5010, 1.02)
        expect(timeline.toOutput(5010)).toBeCloseTo(1.02 + TIMELINE_LATENCY_S, 9)
    })
})
