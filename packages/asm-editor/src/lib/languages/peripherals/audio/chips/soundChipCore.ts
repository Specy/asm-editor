/**
 * The Z80's **Sound chip**: an AY-3-8910 at the MSX's 1.7897725 MHz, rendered at the output's
 * sample rate from its registers ([the design record](../../../../../../../../docs/design/waveform-sound.md#the-sound-chip-on-the-z80)).
 * Like `synthCore.ts` it is the chip, not the program's view of it: it takes register writes and
 * makes sound, and the Z80's reads are answered on the main thread.
 *
 * Translated from ayumi, Peter Sovietov's AY-3-8910 and YM2149 emulator
 * (https://github.com/true-grue/ayumi), keeping its tone, noise and envelope counters, its measured
 * volume table, its resampling (a cubic interpolator at eight times the output rate, then a 192-tap
 * low-pass that decimates by eight) and its DC filter. Left out: the YM2149's table and the stereo
 * panning, since the MSX's AY is one channel of sound.
 *
 * ayumi is under the MIT licence:
 *
 * Copyright (c) Peter Sovietov, http://sovietov.com
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
 * associated documentation files (the "Software"), to deal in the Software without restriction,
 * including without limitation the rights to use, copy, modify, merge, publish, distribute,
 * sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or
 * substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
 * NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
 * DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT
 * OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/** The MSX's clock for its AY: a tone of period P sounds at 1,789,772.5 ÷ (16 × P) Hz. */
export const SOUND_CHIP_CLOCK_HZ = 1_789_772.5

/** The registers that make sound, 0 to 13; 14 and 15 are the I/O ports. */
export const SOUND_CHIP_SOUND_REGISTERS = 14

/** A channel at full volume, matching the Synth's, so the two mix alike. */
const CHANNEL_GAIN = 0.25
const DECIMATE_FACTOR = 8
const FIR_SIZE = 192
const DC_FILTER_SIZE = 1024

/** The AY's volume levels, measured, each repeated so its 16 steps index a 32-step envelope. */
const DAC_TABLE = [
    0.0, 0.0, 0.00999465934234, 0.00999465934234, 0.0144502937362, 0.0144502937362, 0.0210574502174,
    0.0210574502174, 0.0307011520562, 0.0307011520562, 0.0455481803616, 0.0455481803616,
    0.0644998855573, 0.0644998855573, 0.107362478065, 0.107362478065, 0.126588845655,
    0.126588845655, 0.20498970016, 0.20498970016, 0.292210269322, 0.292210269322, 0.372838941024,
    0.372838941024, 0.492530708782, 0.492530708782, 0.635324635691, 0.635324635691, 0.805584802014,
    0.805584802014, 1.0, 1.0
]

const SLIDE_UP = 0
const SLIDE_DOWN = 1
const HOLD_TOP = 2
const HOLD_BOTTOM = 3

/** What each of the 16 envelope shapes does in its first segment and in every one after. */
const ENVELOPES = [
    [SLIDE_DOWN, HOLD_BOTTOM],
    [SLIDE_DOWN, HOLD_BOTTOM],
    [SLIDE_DOWN, HOLD_BOTTOM],
    [SLIDE_DOWN, HOLD_BOTTOM],
    [SLIDE_UP, HOLD_BOTTOM],
    [SLIDE_UP, HOLD_BOTTOM],
    [SLIDE_UP, HOLD_BOTTOM],
    [SLIDE_UP, HOLD_BOTTOM],
    [SLIDE_DOWN, SLIDE_DOWN],
    [SLIDE_DOWN, HOLD_BOTTOM],
    [SLIDE_DOWN, SLIDE_UP],
    [SLIDE_DOWN, HOLD_TOP],
    [SLIDE_UP, SLIDE_UP],
    [SLIDE_UP, HOLD_TOP],
    [SLIDE_UP, SLIDE_DOWN],
    [SLIDE_UP, HOLD_BOTTOM]
]

class ToneChannel {
    period = 1
    counter = 0
    tone = 0
    toneOff = 0
    noiseOff = 0
    envelopeOn = false
    volume = 0
}

export class SoundChipCore {
    private readonly registers = new Uint8Array(16)
    private readonly channels = [new ToneChannel(), new ToneChannel(), new ToneChannel()]
    private noisePeriod = 1
    private noiseCounter = 0
    private noise = 1
    private envelopeCounter = 0
    private envelopePeriod = 1
    private envelopeShape = 0
    private envelopeSegment = 0
    private envelope = 0
    /** Chip ticks of eight clocks per interpolated sample, which runs at eight times the output rate. */
    private readonly step: number
    /**
     * How many of ayumi's samples make one output sample: 1, or more at an output rate too low for
     * its resampler, which needs more than one interpolated sample per chip tick.
     */
    private readonly oversampling: number
    private x = 0
    private readonly interpolatorC = new Float64Array(4)
    private readonly interpolatorY = new Float64Array(4)
    private readonly fir = new Float64Array(FIR_SIZE * 2)
    private firIndex = 0
    private dcSum = 0
    private readonly dcDelay = new Float64Array(DC_FILTER_SIZE)
    private dcIndex = 0
    private mixed = 0

    constructor(
        readonly sampleRate: number,
        clock = SOUND_CHIP_CLOCK_HZ
    ) {
        let oversampling = 1
        while (clock / (sampleRate * oversampling * 8 * DECIMATE_FACTOR) >= 1) oversampling++
        this.oversampling = oversampling
        this.step = clock / (sampleRate * oversampling * 8 * DECIMATE_FACTOR)
    }

    /** Writes register `register`, 0 to 15, as the program's register select and write would. */
    write(register: number, value: number): void {
        if (register < 0 || register >= SOUND_CHIP_SOUND_REGISTERS) return
        value &= 0xff
        this.registers[register] = value
        const r = this.registers
        if (register < 6) {
            const index = register >> 1
            const period = (r[index * 2] | (r[index * 2 + 1] << 8)) & 0xfff
            this.channels[index].period = period || 1
        } else if (register === 6) {
            this.noisePeriod = value & 0x1f || 1
        } else if (register === 7) {
            for (let i = 0; i < 3; i++) {
                this.channels[i].toneOff = (value >> i) & 1
                this.channels[i].noiseOff = (value >> (i + 3)) & 1
            }
        } else if (register <= 10) {
            const channel = this.channels[register - 8]
            channel.envelopeOn = (value & 0x10) !== 0
            channel.volume = value & 0x0f
        } else if (register <= 12) {
            this.envelopePeriod = r[11] | (r[12] << 8) || 1
        } else {
            //writing the shape restarts the envelope, whatever it was
            this.envelopeShape = value & 0x0f
            this.envelopeCounter = 0
            this.envelopeSegment = 0
            this.resetSegment()
        }
    }

    /**
     * Brings the registers to `registers` after an Undo: only the ones that differ are written, so an
     * envelope restarts only when its shape changed.
     */
    load(registers: ArrayLike<number>): void {
        for (let register = 0; register < SOUND_CHIP_SOUND_REGISTERS; register++) {
            if ((registers[register] & 0xff) !== this.registers[register])
                this.write(register, registers[register])
        }
    }

    /** Silences every channel, as a program's end does: its volume registers go to 0. */
    releaseAll(): void {
        for (let register = 8; register <= 10; register++) this.write(register, 0)
    }

    /** Whether any channel can be heard: one with a volume, or on the envelope while it is up. */
    get audible(): boolean {
        return this.channels.some(
            (channel) => channel.volume > 0 || (channel.envelopeOn && this.envelope > 0)
        )
    }

    /**
     * Whether the chip goes on rendering: while heard, and while a channel follows the envelope,
     * which keeps moving through its silent stretches as the chip's does.
     */
    get active(): boolean {
        return this.audible || this.channels.some((channel) => channel.envelopeOn)
    }

    /** Renders into `out` from `start` to `end`, replacing what it held. */
    render(out: Float32Array, start = 0, end = out.length): void {
        for (let i = start; i < end; i++) {
            let y = this.process()
            for (let k = 1; k < this.oversampling; k++) y += this.process()
            y /= this.oversampling
            //ayumi's DC filter: the signal less its average over the last 1,024 samples
            this.dcSum += y - this.dcDelay[this.dcIndex]
            this.dcDelay[this.dcIndex] = y
            this.dcIndex = (this.dcIndex + 1) & (DC_FILTER_SIZE - 1)
            const sample = (y - this.dcSum / DC_FILTER_SIZE) * CHANNEL_GAIN
            out[i] = sample > 1 ? 1 : sample < -1 ? -1 : sample
        }
    }

    private updateTone(channel: ToneChannel): number {
        channel.counter += 1
        if (channel.counter >= channel.period) {
            channel.counter = 0
            channel.tone ^= 1
        }
        return channel.tone
    }

    private updateNoise(): number {
        this.noiseCounter += 1
        if (this.noiseCounter >= this.noisePeriod << 1) {
            this.noiseCounter = 0
            const bit = (this.noise ^ (this.noise >> 3)) & 1
            this.noise = (this.noise >> 1) | (bit << 16)
        }
        return this.noise & 1
    }

    private resetSegment(): void {
        const action = ENVELOPES[this.envelopeShape][this.envelopeSegment]
        this.envelope = action === SLIDE_DOWN || action === HOLD_TOP ? 31 : 0
    }

    private updateEnvelope(): number {
        this.envelopeCounter += 1
        if (this.envelopeCounter >= this.envelopePeriod) {
            this.envelopeCounter = 0
            const action = ENVELOPES[this.envelopeShape][this.envelopeSegment]
            if (action === SLIDE_UP) {
                this.envelope += 1
                if (this.envelope > 31) {
                    this.envelopeSegment ^= 1
                    this.resetSegment()
                }
            } else if (action === SLIDE_DOWN) {
                this.envelope -= 1
                if (this.envelope < 0) {
                    this.envelopeSegment ^= 1
                    this.resetSegment()
                }
            }
        }
        return this.envelope
    }

    /** One tick of eight clocks: the counters step, and the three channels mix. */
    private updateMixer(): void {
        const noise = this.updateNoise()
        const envelope = this.updateEnvelope()
        let mixed = 0
        for (const channel of this.channels) {
            let out = (this.updateTone(channel) | channel.toneOff) & (noise | channel.noiseOff)
            out *= channel.envelopeOn ? envelope : channel.volume * 2 + 1
            mixed += DAC_TABLE[out]
        }
        this.mixed = mixed
    }

    /** One output sample: eight interpolated ones from the chip's ticks, then the low-pass that keeps one. */
    private process(): number {
        const c = this.interpolatorC
        const y = this.interpolatorY
        const base = FIR_SIZE - this.firIndex * DECIMATE_FACTOR
        this.firIndex = (this.firIndex + 1) % (FIR_SIZE / DECIMATE_FACTOR - 1)
        for (let i = DECIMATE_FACTOR - 1; i >= 0; i--) {
            this.x += this.step
            if (this.x >= 1) {
                this.x -= 1
                y[0] = y[1]
                y[1] = y[2]
                y[2] = y[3]
                this.updateMixer()
                y[3] = this.mixed
                const y1 = y[2] - y[0]
                c[0] = 0.5 * y[1] + 0.25 * (y[0] + y[2])
                c[1] = 0.5 * y1
                c[2] = 0.25 * (y[3] - y[1] - y1)
            }
            this.fir[base + i] = (c[2] * this.x + c[1]) * this.x + c[0]
        }
        return this.decimate(base)
    }

    /** ayumi's low-pass, read from `o` in the FIR buffer; it carries the last eight samples over. */
    private decimate(o: number): number {
        const x = this.fir
        const y =
            -0.0000046183113992051936 * (x[o + 1] + x[o + 191]) +
            -0.00001117761640887225 * (x[o + 2] + x[o + 190]) +
            -0.000018610264502005432 * (x[o + 3] + x[o + 189]) +
            -0.000025134586135631012 * (x[o + 4] + x[o + 188]) +
            -0.000028494281690666197 * (x[o + 5] + x[o + 187]) +
            -0.000026396828793275159 * (x[o + 6] + x[o + 186]) +
            -0.000017094212558802156 * (x[o + 7] + x[o + 185]) +
            0.000023798193576966866 * (x[o + 9] + x[o + 183]) +
            0.000051281160242202183 * (x[o + 10] + x[o + 182]) +
            0.00007762197826243427 * (x[o + 11] + x[o + 181]) +
            0.000096759426664120416 * (x[o + 12] + x[o + 180]) +
            0.00010240229300393402 * (x[o + 13] + x[o + 179]) +
            0.000089344614218077106 * (x[o + 14] + x[o + 178]) +
            0.000054875700118949183 * (x[o + 15] + x[o + 177]) +
            -0.000069839082210680165 * (x[o + 17] + x[o + 175]) +
            -0.0001447966132360757 * (x[o + 18] + x[o + 174]) +
            -0.00021158452917708308 * (x[o + 19] + x[o + 173]) +
            -0.00025535069106550544 * (x[o + 20] + x[o + 172]) +
            -0.00026228714374322104 * (x[o + 21] + x[o + 171]) +
            -0.00022258805927027799 * (x[o + 22] + x[o + 170]) +
            -0.00013323230495695704 * (x[o + 23] + x[o + 169]) +
            0.00016182578767055206 * (x[o + 25] + x[o + 167]) +
            0.00032846175385096581 * (x[o + 26] + x[o + 166]) +
            0.00047045611576184863 * (x[o + 27] + x[o + 165]) +
            0.00055713851457530944 * (x[o + 28] + x[o + 164]) +
            0.00056212565121518726 * (x[o + 29] + x[o + 163]) +
            0.00046901918553962478 * (x[o + 30] + x[o + 162]) +
            0.00027624866838952986 * (x[o + 31] + x[o + 161]) +
            -0.00032564179486838622 * (x[o + 33] + x[o + 159]) +
            -0.00065182310286710388 * (x[o + 34] + x[o + 158]) +
            -0.00092127787309319298 * (x[o + 35] + x[o + 157]) +
            -0.0010772534348943575 * (x[o + 36] + x[o + 156]) +
            -0.0010737727700273478 * (x[o + 37] + x[o + 155]) +
            -0.00088556645390392634 * (x[o + 38] + x[o + 154]) +
            -0.00051581896090765534 * (x[o + 39] + x[o + 153]) +
            0.00059548767193795277 * (x[o + 41] + x[o + 151]) +
            0.0011803558710661009 * (x[o + 42] + x[o + 150]) +
            0.0016527320270369871 * (x[o + 43] + x[o + 149]) +
            0.0019152679330965555 * (x[o + 44] + x[o + 148]) +
            0.0018927324805381538 * (x[o + 45] + x[o + 147]) +
            0.0015481870327877937 * (x[o + 46] + x[o + 146]) +
            0.00089470695834941306 * (x[o + 47] + x[o + 145]) +
            -0.0010178225878206125 * (x[o + 49] + x[o + 143]) +
            -0.0020037400552054292 * (x[o + 50] + x[o + 142]) +
            -0.0027874356824117317 * (x[o + 51] + x[o + 141]) +
            -0.003210329988021943 * (x[o + 52] + x[o + 140]) +
            -0.0031540624117984395 * (x[o + 53] + x[o + 139]) +
            -0.0025657163651900345 * (x[o + 54] + x[o + 138]) +
            -0.0014750752642111449 * (x[o + 55] + x[o + 137]) +
            0.0016624165446378462 * (x[o + 57] + x[o + 135]) +
            0.0032591192839069179 * (x[o + 58] + x[o + 134]) +
            0.0045165685815867747 * (x[o + 59] + x[o + 133]) +
            0.0051838984346123896 * (x[o + 60] + x[o + 132]) +
            0.0050774264697459933 * (x[o + 61] + x[o + 131]) +
            0.0041192521414141585 * (x[o + 62] + x[o + 130]) +
            0.0023628575417966491 * (x[o + 63] + x[o + 129]) +
            -0.0026543507866759182 * (x[o + 65] + x[o + 127]) +
            -0.0051990251084333425 * (x[o + 66] + x[o + 126]) +
            -0.0072020238234656924 * (x[o + 67] + x[o + 125]) +
            -0.0082672928192007358 * (x[o + 68] + x[o + 124]) +
            -0.0081033739572956287 * (x[o + 69] + x[o + 123]) +
            -0.006583111539570221 * (x[o + 70] + x[o + 122]) +
            -0.0037839040415292386 * (x[o + 71] + x[o + 121]) +
            0.0042781252851152507 * (x[o + 73] + x[o + 119]) +
            0.0084176358598320178 * (x[o + 74] + x[o + 118]) +
            0.01172566057463055 * (x[o + 75] + x[o + 117]) +
            0.013550476647788672 * (x[o + 76] + x[o + 116]) +
            0.013388189369997496 * (x[o + 77] + x[o + 115]) +
            0.010979501242341259 * (x[o + 78] + x[o + 114]) +
            0.006381274941685413 * (x[o + 79] + x[o + 113]) +
            -0.007421229604153888 * (x[o + 81] + x[o + 111]) +
            -0.01486456304340213 * (x[o + 82] + x[o + 110]) +
            -0.021143584622178104 * (x[o + 83] + x[o + 109]) +
            -0.02504275058758609 * (x[o + 84] + x[o + 108]) +
            -0.025473530942547201 * (x[o + 85] + x[o + 107]) +
            -0.021627310017882196 * (x[o + 86] + x[o + 106]) +
            -0.013104323383225543 * (x[o + 87] + x[o + 105]) +
            0.017065133989980476 * (x[o + 89] + x[o + 103]) +
            0.036978919264451952 * (x[o + 90] + x[o + 102]) +
            0.05823318062093958 * (x[o + 91] + x[o + 101]) +
            0.079072012081405949 * (x[o + 92] + x[o + 100]) +
            0.097675998716952317 * (x[o + 93] + x[o + 99]) +
            0.11236045936950932 * (x[o + 94] + x[o + 98]) +
            0.12176343577287731 * (x[o + 95] + x[o + 97]) +
            0.125 * x[o + 96]
        x.copyWithin(o + FIR_SIZE - DECIMATE_FACTOR, o, o + DECIMATE_FACTOR)
        return y
    }
}
