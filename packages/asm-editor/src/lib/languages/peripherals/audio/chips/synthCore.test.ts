import { describe, expect, it } from 'vite-plus/test'
import {
    SYNTH_ATTACK,
    SYNTH_CONTROL,
    SYNTH_DECAY,
    SYNTH_FREQUENCY,
    SYNTH_GATE,
    SYNTH_LOOP,
    SYNTH_LOOP_START,
    SYNTH_PULSE_WIDTH,
    SYNTH_RELEASE,
    SYNTH_SAMPLE_LENGTH,
    SYNTH_SAMPLE_START,
    SYNTH_SUSTAIN,
    SYNTH_VOLUME,
    SYNTH_WAVEFORM,
    SYNTH_WAVEFORMS,
    SYNTH_WAVETABLES,
    type SynthWaveform
} from '../../../synthRegisters'
import { peak, renderSeconds, risingCrossings } from './chipTestSignals'
import { SynthCore } from './synthCore'

const RATE = 48_000
/** A channel at full volume plays at a quarter of full scale. */
const FULL = 0.25

type ChannelSettings = {
    waveform: SynthWaveform
    frequency: number
    attack?: number
    decay?: number
    sustain?: number
    release?: number
    pulseWidth?: number
    volume?: number
}

function play(synth: SynthCore, channel: number, settings: ChannelSettings): void {
    const base = channel * 0x20
    synth.write(base + SYNTH_WAVEFORM, SYNTH_WAVEFORMS.indexOf(settings.waveform))
    synth.write(base + SYNTH_FREQUENCY, settings.frequency)
    synth.write(base + SYNTH_PULSE_WIDTH, settings.pulseWidth ?? 2048)
    synth.write(base + SYNTH_ATTACK, settings.attack ?? 0)
    synth.write(base + SYNTH_DECAY, settings.decay ?? 0)
    synth.write(base + SYNTH_SUSTAIN, settings.sustain ?? 127)
    synth.write(base + SYNTH_RELEASE, settings.release ?? 0)
    synth.write(base + SYNTH_VOLUME, settings.volume ?? 127)
    synth.write(base + SYNTH_CONTROL, SYNTH_GATE)
}

/** One period of a sine as signed 8-bit samples. */
function sineSamples(length: number): Uint8Array {
    return Uint8Array.from(
        { length },
        (_, i) => Math.round(100 * Math.sin((2 * Math.PI * i) / length)) & 0xff
    )
}

describe('SynthCore', () => {
    it('is silent until a gate goes on', () => {
        const synth = new SynthCore(RATE)
        synth.write(SYNTH_FREQUENCY, 440)
        synth.write(SYNTH_VOLUME, 127)
        expect(synth.audible).toBe(false)
        expect(peak(renderSeconds(synth, RATE, 0.1), RATE, 0, 0.1)).toBe(0)
    })

    it.each(['sine', 'triangle', 'sawtooth', 'pulse'] as const)(
        'plays a %s at its frequency in Hz',
        (waveform) => {
            const synth = new SynthCore(RATE)
            play(synth, 0, { waveform, frequency: 440 })
            expect(risingCrossings(renderSeconds(synth, RATE, 1))).toBeCloseTo(440, -1)
        }
    )

    it('plays a frequency on each channel and mixes them', () => {
        const synth = new SynthCore(RATE)
        play(synth, 0, { waveform: 'sine', frequency: 440, volume: 64 })
        play(synth, 7, { waveform: 'sine', frequency: 440, volume: 64 })
        const both = peak(renderSeconds(synth, RATE, 0.5), RATE, 0.25, 0.5)
        expect(both).toBeCloseTo(2 * (64 / 127) * FULL, 2)
    })

    it('holds a pulse high for its width out of 4096', () => {
        const synth = new SynthCore(RATE)
        play(synth, 0, { waveform: 'pulse', frequency: 100, pulseWidth: 1024 })
        const signal = renderSeconds(synth, RATE, 2).subarray(RATE)
        const high = signal.filter((value) => value > 0).length / signal.length
        expect(high).toBeCloseTo(0.25, 1)
    })

    it('reads a wavetable once per period', () => {
        const synth = new SynthCore(RATE)
        //sixteen samples of 15 then sixteen of 0: a square wave
        for (let i = 0; i < 16; i++) synth.write(SYNTH_WAVETABLES + i, i < 8 ? 0xff : 0x00)
        play(synth, 0, { waveform: 'wavetable', frequency: 220 })
        expect(risingCrossings(renderSeconds(synth, RATE, 1))).toBeCloseTo(220, -1)
    })

    it('keeps its noise moving', () => {
        const synth = new SynthCore(RATE)
        play(synth, 0, { waveform: 'noise', frequency: 20_000 })
        const signal = renderSeconds(synth, RATE, 1)
        expect(risingCrossings(signal)).toBeGreaterThan(2_000)
        expect(peak(signal, RATE, 0.9, 1)).toBeGreaterThan(0.1)
    })

    it('rises over its attack, falls over its decay to the sustain and fades over its release', () => {
        const synth = new SynthCore(RATE)
        //an attack of one second, a decay of half a second from full to silence, sustain at half
        play(synth, 0, {
            waveform: 'sine',
            frequency: 1000,
            attack: 1024,
            decay: 512,
            sustain: 64,
            release: 1024
        })
        const held = renderSeconds(synth, RATE, 2)
        expect(peak(held, RATE, 0.49, 0.51)).toBeCloseTo(0.5 * FULL, 2)
        expect(peak(held, RATE, 0.99, 1.01)).toBeCloseTo(FULL, 2)
        //the decay falls the whole scale in half a second, so 0.12 s into it the level is 0.76
        expect(peak(held, RATE, 1.12, 1.13)).toBeCloseTo(0.76 * FULL, 2)
        expect(peak(held, RATE, 1.9, 2)).toBeCloseTo((64 / 127) * FULL, 2)

        synth.write(SYNTH_CONTROL, 0)
        const released = renderSeconds(synth, RATE, 1)
        expect(peak(released, RATE, 0.24, 0.26)).toBeCloseTo((64 / 127 - 0.25) * FULL, 2)
        expect(synth.audible).toBe(false)
        expect(peak(released, RATE, 0.6, 1)).toBeLessThan(0.001)
    })

    it('attacks again when the gate goes off and on, and not when it is written on again', () => {
        const synth = new SynthCore(RATE)
        play(synth, 0, { waveform: 'sine', frequency: 1000, decay: 4096, sustain: 0 })
        renderSeconds(synth, RATE, 2)
        synth.write(SYNTH_CONTROL, SYNTH_GATE)
        const rewritten = renderSeconds(synth, RATE, 0.01)
        expect(peak(rewritten, RATE, 0, 0.01)).toBeCloseTo(0.5 * FULL, 1)

        synth.write(SYNTH_CONTROL, 0)
        synth.write(SYNTH_CONTROL, SYNTH_GATE)
        const retriggered = renderSeconds(synth, RATE, 0.01)
        expect(peak(retriggered, RATE, 0, 0.01)).toBeCloseTo(FULL, 1)
    })

    it('plays a sample at its rate in samples a second, an octave up at twice the rate', () => {
        for (const [rate, frequency] of [
            [8000, 100],
            [16_000, 200]
        ]) {
            const synth = new SynthCore(RATE)
            synth.upload(1000, sineSamples(80))
            synth.write(SYNTH_SAMPLE_START, 1000)
            synth.write(SYNTH_SAMPLE_LENGTH, 80)
            synth.write(SYNTH_LOOP_START, 1000)
            play(synth, 0, { waveform: 'sample', frequency: rate })
            synth.write(SYNTH_CONTROL, SYNTH_GATE | SYNTH_LOOP)
            expect(risingCrossings(renderSeconds(synth, RATE, 1))).toBeCloseTo(frequency, -1)
        }
    })

    it('plays a sample once without the loop bit, and from the loop start with it', () => {
        const once = new SynthCore(RATE)
        for (let period = 0; period < 10; period++) once.upload(period * 80, sineSamples(80))
        once.write(SYNTH_SAMPLE_LENGTH, 800)
        play(once, 0, { waveform: 'sample', frequency: 8000 })
        //ten periods of 80 samples, a tenth of a second, then nothing
        const played = renderSeconds(once, RATE, 0.5)
        expect(peak(played, RATE, 0.05, 0.09)).toBeGreaterThan(0.1)
        expect(peak(played, RATE, 0.2, 0.5)).toBeLessThan(0.01)

        const looped = new SynthCore(RATE)
        //a silent lead-in, then one period that the loop repeats
        looped.upload(0, new Uint8Array(400))
        looped.upload(400, sineSamples(80))
        looped.write(SYNTH_SAMPLE_LENGTH, 480)
        looped.write(SYNTH_LOOP_START, 400)
        play(looped, 0, { waveform: 'sample', frequency: 8000 })
        looped.write(SYNTH_CONTROL, SYNTH_GATE | SYNTH_LOOP)
        const signal = renderSeconds(looped, RATE, 1)
        expect(peak(signal, RATE, 0.9, 1)).toBeGreaterThan(0.1)
        //100 Hz once the lead-in's twentieth of a second has played
        expect(Math.abs(risingCrossings(signal) - 95)).toBeLessThanOrEqual(2)
    })

    it('is not heard with its gate on at volume 0, though its envelope runs', () => {
        const synth = new SynthCore(RATE)
        play(synth, 0, { waveform: 'sine', frequency: 440, volume: 0 })
        renderSeconds(synth, RATE, 0.1)
        expect(synth.audible).toBe(false)
        expect(synth.active).toBe(true)
        synth.write(SYNTH_VOLUME, 100)
        expect(synth.audible).toBe(true)
    })

    it('is not heard held at a sustain of 0', () => {
        const synth = new SynthCore(RATE)
        play(synth, 0, { waveform: 'noise', frequency: 9000, decay: 50, sustain: 0 })
        renderSeconds(synth, RATE, 0.2)
        expect(synth.audible).toBe(false)
    })

    it('releases every gated channel at once', () => {
        const synth = new SynthCore(RATE)
        play(synth, 0, { waveform: 'pulse', frequency: 300, release: 100 })
        play(synth, 3, { waveform: 'noise', frequency: 9000, release: 100 })
        renderSeconds(synth, RATE, 0.1)
        synth.releaseAll()
        renderSeconds(synth, RATE, 0.2)
        expect(synth.audible).toBe(false)
    })
})
