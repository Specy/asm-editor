import { describe, expect, it } from 'vite-plus/test'
import { peak, renderSeconds, risingCrossings } from './chipTestSignals'
import { SoundChipCore } from './soundChipCore'

const RATE = 48_000
/** Register 7 with channel A's tone on and everything else off. */
const TONE_A = 0b111110
const NOISE_A = 0b110111

/** An envelope period whose slide takes a second: 256 clocks a step-pair, 1,789,772.5 a second. */
const ONE_SECOND = Math.round(1_789_772.5 / 256)

function toneA(chip: SoundChipCore, period: number, volume: number): void {
    chip.write(0, period & 0xff)
    chip.write(1, period >> 8)
    chip.write(7, TONE_A)
    chip.write(8, volume)
}

function envelope(chip: SoundChipCore, period: number, shape: number): void {
    chip.write(11, period & 0xff)
    chip.write(12, period >> 8)
    chip.write(13, shape)
}

describe('SoundChipCore', () => {
    it('plays period 254 at 440 Hz, as an MSX does', () => {
        const chip = new SoundChipCore(RATE)
        toneA(chip, 254, 15)
        //past the DC filter's first 1,024 samples
        const signal = renderSeconds(chip, RATE, 1.1).subarray(RATE / 10)
        expect(risingCrossings(signal)).toBeCloseTo(1_789_772.5 / (16 * 254), -1)
    })

    it('is silent at volume 0 and with both tone and noise off', () => {
        const chip = new SoundChipCore(RATE)
        toneA(chip, 254, 0)
        expect(peak(renderSeconds(chip, RATE, 0.2), RATE, 0.1, 0.2)).toBeLessThan(0.001)
        chip.write(8, 15)
        chip.write(7, 0b111111)
        //a constant level, which the DC filter takes away
        expect(peak(renderSeconds(chip, RATE, 0.2), RATE, 0.1, 0.2)).toBeLessThan(0.001)
    })

    it('scales a channel by its volume on the measured curve', () => {
        const loud = new SoundChipCore(RATE)
        toneA(loud, 254, 15)
        const quiet = new SoundChipCore(RATE)
        toneA(quiet, 254, 11)
        const ratio =
            peak(renderSeconds(quiet, RATE, 0.3), RATE, 0.2, 0.3) /
            peak(renderSeconds(loud, RATE, 0.3), RATE, 0.2, 0.3)
        //the table's level for 11 against 15
        expect(ratio).toBeCloseTo(0.372838941024, 1)
    })

    it('mixes noise in place of the tone', () => {
        const chip = new SoundChipCore(RATE)
        toneA(chip, 254, 15)
        chip.write(6, 1)
        chip.write(7, NOISE_A)
        const signal = renderSeconds(chip, RATE, 1)
        expect(risingCrossings(signal)).toBeGreaterThan(2_000)
    })

    it('falls once and holds silent with envelope shape 0', () => {
        const chip = new SoundChipCore(RATE)
        toneA(chip, 254, 0x10)
        envelope(chip, ONE_SECOND, 0)
        const signal = renderSeconds(chip, RATE, 2)
        expect(peak(signal, RATE, 0.05, 0.15)).toBeGreaterThan(2 * peak(signal, RATE, 0.75, 0.85))
        expect(peak(signal, RATE, 1.2, 2)).toBeLessThan(0.001)
    })

    it('rises and holds with shape 13, and repeats a triangle with shape 14', () => {
        const rising = new SoundChipCore(RATE)
        toneA(rising, 254, 0x10)
        envelope(rising, ONE_SECOND, 13)
        const held = renderSeconds(rising, RATE, 3)
        expect(peak(held, RATE, 0.05, 0.15)).toBeLessThan(peak(held, RATE, 0.85, 0.95) / 2)
        expect(peak(held, RATE, 2.5, 3)).toBeCloseTo(peak(held, RATE, 1.5, 2), 2)

        const triangle = new SoundChipCore(RATE)
        toneA(triangle, 254, 0x10)
        envelope(triangle, ONE_SECOND, 14)
        const signal = renderSeconds(triangle, RATE, 4)
        //up for a second, down for the next, up again
        expect(peak(signal, RATE, 0.9, 1)).toBeGreaterThan(2 * peak(signal, RATE, 1.85, 1.95))
        expect(peak(signal, RATE, 2.9, 3)).toBeGreaterThan(2 * peak(signal, RATE, 1.85, 1.95))
    })

    it('restarts the envelope when its shape is written, the same shape included', () => {
        const chip = new SoundChipCore(RATE)
        toneA(chip, 254, 0x10)
        envelope(chip, ONE_SECOND, 0)
        renderSeconds(chip, RATE, 1.5)
        chip.write(13, 0)
        expect(peak(renderSeconds(chip, RATE, 0.1), RATE, 0.02, 0.1)).toBeGreaterThan(0.1)
    })

    it('loads only the registers that differ, so an unchanged shape keeps its envelope', () => {
        const chip = new SoundChipCore(RATE)
        toneA(chip, 254, 0x10)
        envelope(chip, ONE_SECOND, 0)
        renderSeconds(chip, RATE, 1.5)
        const registers = [
            254,
            0,
            0,
            0,
            0,
            0,
            0,
            TONE_A,
            0x10,
            0,
            0,
            ONE_SECOND & 0xff,
            ONE_SECOND >> 8,
            0
        ]
        chip.load(registers)
        expect(peak(renderSeconds(chip, RATE, 0.1), RATE, 0.02, 0.1)).toBeLessThan(0.001)
        chip.load([...registers.slice(0, 8), 15, ...registers.slice(9)])
        expect(peak(renderSeconds(chip, RATE, 0.1), RATE, 0.05, 0.1)).toBeGreaterThan(0.1)
    })

    it('silences its channels when released', () => {
        const chip = new SoundChipCore(RATE)
        toneA(chip, 254, 15)
        chip.write(9, 15)
        expect(chip.audible).toBe(true)
        chip.releaseAll()
        expect(chip.audible).toBe(false)
        expect(peak(renderSeconds(chip, RATE, 0.1), RATE, 0.05, 0.1)).toBeLessThan(0.001)
    })

    it('ignores registers 14 and 15', () => {
        const chip = new SoundChipCore(RATE)
        chip.write(14, 0xff)
        chip.write(15, 0xff)
        expect(chip.audible).toBe(false)
    })

    it('plays at an output rate too low for its resampler, averaging the samples it makes', () => {
        const rate = 22_050
        const chip = new SoundChipCore(rate)
        toneA(chip, 254, 15)
        const signal = renderSeconds(chip, rate, 1.1).subarray(rate / 10)
        expect(risingCrossings(signal)).toBeCloseTo(1_789_772.5 / (16 * 254), -1)
    })

    it('goes on running while a channel follows the envelope, heard or not', () => {
        const chip = new SoundChipCore(RATE)
        toneA(chip, 254, 0x10)
        envelope(chip, ONE_SECOND, 0)
        renderSeconds(chip, RATE, 1.5)
        //fallen to silence and held there, but the envelope is the channel's volume
        expect(chip.audible).toBe(false)
        expect(chip.active).toBe(true)
    })
})
