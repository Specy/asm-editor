import {
    SYNTH_ATTACK,
    SYNTH_CHANNEL_COUNT,
    SYNTH_CHANNEL_SIZE,
    SYNTH_CLOCK_HZ,
    SYNTH_CONTROL,
    SYNTH_DECAY,
    SYNTH_ENVELOPE_TICKS_PER_SECOND,
    SYNTH_FREQUENCY,
    SYNTH_GATE,
    SYNTH_LOOP,
    SYNTH_LOOP_START,
    SYNTH_PULSE_WIDTH,
    SYNTH_RELEASE,
    SYNTH_SAMPLE_LENGTH,
    SYNTH_SAMPLE_MEMORY_SIZE,
    SYNTH_SAMPLE_START,
    SYNTH_SUSTAIN,
    SYNTH_VOLUME,
    SYNTH_WAVEFORM,
    SYNTH_WAVETABLE_SIZE,
    SYNTH_WAVETABLES
} from '../../../synthRegisters'

/**
 * The **Synth**'s sound: eight channels rendered at the output's sample rate from their registers
 * ([the design record](../../../../../../../../docs/design/waveform-sound.md#the-synth-channel)).
 * It is the chip, not the program's view of it: it takes register writes already decoded from the
 * Target's byte order, reacts to them as the hardware would, a gate's rising edge attacking and its
 * falling edge releasing, and never answers anything back but whether it is still heard.
 *
 * Each channel's 16-bit phase accumulator steps by frequency × 65,536 ÷ the output rate per output
 * sample, which is what the chip's 65,536 Hz clock adds between two of them; the waveforms read its
 * top bits with no band limiting, aliasing as a chip of the time did. The envelope runs smoothly at
 * its 1,024 ticks a second rather than in steps.
 *
 * No Web Audio here: the worklet renders it, and the tests run it under node.
 */

/** A channel at full volume, so that a few play together before the mix clips. */
const CHANNEL_GAIN = 0.25
/** The DC blocker's cutoff, as the capacitor on a chip's output would have it. */
const DC_CUTOFF_HZ = 10

const SINE = Float32Array.from({ length: 256 }, (_, i) => Math.sin((2 * Math.PI * i) / 256))

/** Where a channel's envelope is. */
const IDLE = 0
const ATTACK = 1
const DECAY = 2
const SUSTAIN = 3
const RELEASE = 4

class Channel {
    frequency = 0
    pulseWidth = 0
    attack = 0
    decay = 0
    release = 0
    sampleStart = 0
    sampleLength = 0
    loopStart = 0
    control = 0
    waveform = 0
    volume = 0
    sustain = 0

    /** The phase accumulator, 0 to 65,535 and its fraction. */
    phase = 0
    /** The noise generator's 15-bit shift register, which is never 0. */
    noise = 1
    stage = IDLE
    level = 0
    /** Where the sample waveform is in Sample memory, and how many samples it has left. */
    position = 0
    remaining = 0
    /** The sample waveform played its length without looping. */
    finished = true
}

export class SynthCore {
    private readonly channels = Array.from({ length: SYNTH_CHANNEL_COUNT }, () => new Channel())
    private readonly wavetables = new Uint8Array(SYNTH_CHANNEL_COUNT * SYNTH_WAVETABLE_SIZE)
    private readonly samples = new Int8Array(SYNTH_SAMPLE_MEMORY_SIZE)
    /** Accumulator steps per output sample for a frequency of 1. */
    private readonly phaseStep: number
    /** Envelope ticks per output sample. */
    private readonly tickStep: number
    private readonly dcPole: number
    private dcInput = 0
    private dcOutput = 0

    constructor(readonly sampleRate: number) {
        this.phaseStep = SYNTH_CLOCK_HZ / sampleRate
        this.tickStep = SYNTH_ENVELOPE_TICKS_PER_SECOND / sampleRate
        this.dcPole = 1 - (2 * Math.PI * DC_CUTOFF_HZ) / sampleRate
    }

    /**
     * Writes one register, at its offset in the block, with its value. A control byte whose gate
     * goes from off to on attacks, and from on to off releases; writing the gate it already has
     * changes nothing, as on the SID.
     */
    write(offset: number, value: number): void {
        if (offset >= SYNTH_WAVETABLES) {
            const index = offset - SYNTH_WAVETABLES
            if (index < this.wavetables.length) this.wavetables[index] = value
            return
        }
        const channel = this.channels[(offset / SYNTH_CHANNEL_SIZE) | 0]
        switch (offset % SYNTH_CHANNEL_SIZE) {
            case SYNTH_FREQUENCY:
                channel.frequency = value & 0xffff
                break
            case SYNTH_PULSE_WIDTH:
                channel.pulseWidth = value & 0xffff
                break
            case SYNTH_ATTACK:
                channel.attack = value & 0xffff
                break
            case SYNTH_DECAY:
                channel.decay = value & 0xffff
                break
            case SYNTH_RELEASE:
                channel.release = value & 0xffff
                break
            case SYNTH_SAMPLE_START:
                channel.sampleStart = value & 0xffff
                break
            case SYNTH_SAMPLE_LENGTH:
                channel.sampleLength = value & 0xffff
                break
            case SYNTH_LOOP_START:
                channel.loopStart = value & 0xffff
                break
            case SYNTH_CONTROL:
                this.setControl(channel, value & 0xff)
                break
            case SYNTH_WAVEFORM:
                channel.waveform = value & 0xff
                break
            case SYNTH_VOLUME:
                channel.volume = Math.min(value & 0xff, 127)
                break
            case SYNTH_SUSTAIN:
                channel.sustain = Math.min(value & 0xff, 127)
                break
        }
    }

    /** Copies `bytes` into Sample memory from `offset`, wrapping past its end. */
    upload(offset: number, bytes: Uint8Array): void {
        for (let i = 0; i < bytes.length; i++) {
            this.samples[(offset + i) & (SYNTH_SAMPLE_MEMORY_SIZE - 1)] = bytes[i]
        }
    }

    /** Turns every gate off, so each channel fades through its release. */
    releaseAll(): void {
        for (const channel of this.channels) this.setControl(channel, channel.control & ~SYNTH_GATE)
    }

    /**
     * Whether any channel can be heard: past its attack's start, at a level above 0 and a volume
     * above 0. A gated channel at volume 0 is silent, however long its gate stays on.
     */
    get audible(): boolean {
        return this.channels.some(
            (channel) =>
                channel.stage !== IDLE &&
                channel.volume > 0 &&
                (channel.level > 0 || channel.stage === ATTACK)
        )
    }

    /**
     * Whether any channel's envelope is moving or held, which the chip goes on rendering whether
     * heard or not, so that a channel turned up later is where its envelope would be.
     */
    get active(): boolean {
        return this.channels.some((channel) => channel.stage !== IDLE)
    }

    private setControl(channel: Channel, control: number): void {
        const was = channel.control & SYNTH_GATE
        channel.control = control
        const gate = control & SYNTH_GATE
        if (gate && !was) {
            //from the level it is at, so a retriggered note does not click
            channel.stage = ATTACK
            channel.position = channel.sampleStart
            channel.remaining = channel.sampleLength || SYNTH_SAMPLE_MEMORY_SIZE
            channel.finished = false
        } else if (!gate && was && channel.stage !== IDLE) {
            channel.stage = RELEASE
        }
    }

    /** Renders into `out` from `start` to `end`, replacing what it held. */
    render(out: Float32Array, start = 0, end = out.length): void {
        out.fill(0, start, end)
        for (let c = 0; c < this.channels.length; c++) {
            const channel = this.channels[c]
            if (channel.stage === IDLE) continue
            this.renderChannel(channel, c, out, start, end)
        }
        let input = this.dcInput
        let output = this.dcOutput
        for (let i = start; i < end; i++) {
            const x = out[i]
            output = x - input + this.dcPole * output
            input = x
            out[i] = output > 1 ? 1 : output < -1 ? -1 : output
        }
        this.dcInput = input
        this.dcOutput = output
    }

    private renderChannel(
        channel: Channel,
        index: number,
        out: Float32Array,
        start: number,
        end: number
    ): void {
        const step = channel.frequency * this.phaseStep
        const gain = (channel.volume / 127) * CHANNEL_GAIN
        for (let i = start; i < end; i++) {
            const level = this.stepEnvelope(channel)
            if (channel.stage === IDLE) break
            out[i] += this.value(channel, index) * level * gain
            channel.phase += step
            if (channel.phase >= SYNTH_CLOCK_HZ) {
                const wraps = Math.floor(channel.phase / SYNTH_CLOCK_HZ)
                channel.phase -= wraps * SYNTH_CLOCK_HZ
                this.wrapped(channel, wraps)
            }
        }
    }

    /** The waveform's value at the channel's phase, from -1 to 1. */
    private value(channel: Channel, index: number): number {
        const phase = channel.phase
        switch (channel.waveform) {
            case 0:
                //the accumulator's top 12 bits against the pulse width
                return phase / 16 < channel.pulseWidth ? 1 : -1
            case 1: {
                const p = phase / SYNTH_CLOCK_HZ
                return p < 0.5 ? 4 * p - 1 : 3 - 4 * p
            }
            case 2:
                return (2 * phase) / SYNTH_CLOCK_HZ - 1
            case 3:
                return SINE[phase >>> 8]
            case 4:
                return channel.noise & 1 ? 1 : -1
            case 5: {
                const sample = phase >>> 11
                const byte = this.wavetables[index * SYNTH_WAVETABLE_SIZE + (sample >>> 1)]
                return (sample & 1 ? byte & 0x0f : byte >>> 4) / 7.5 - 1
            }
            case 6:
                return channel.finished ? 0 : this.samples[channel.position] / 128
            default:
                return 0
        }
    }

    /** What the accumulator's wrapping steps: the noise register and the sample waveform. */
    private wrapped(channel: Channel, wraps: number): void {
        if (channel.waveform === 4) {
            for (let n = 0; n < wraps; n++) {
                const bit = (channel.noise ^ (channel.noise >>> 1)) & 1
                channel.noise = (channel.noise >>> 1) | (bit << 14)
            }
        } else if (channel.waveform === 6 && !channel.finished) {
            for (let n = 0; n < wraps; n++) {
                channel.position = (channel.position + 1) & (SYNTH_SAMPLE_MEMORY_SIZE - 1)
                if (--channel.remaining > 0) continue
                if ((channel.control & SYNTH_LOOP) === 0) {
                    channel.finished = true
                    return
                }
                //the loop runs from the loop start to the sample's end
                const end = channel.sampleStart + (channel.sampleLength || SYNTH_SAMPLE_MEMORY_SIZE)
                channel.position = channel.loopStart
                channel.remaining =
                    (end - channel.loopStart) & (SYNTH_SAMPLE_MEMORY_SIZE - 1) ||
                    SYNTH_SAMPLE_MEMORY_SIZE
            }
        }
    }

    /** Advances the envelope by one output sample and answers its level, 0 to 1. */
    private stepEnvelope(channel: Channel): number {
        const tick = this.tickStep
        switch (channel.stage) {
            case ATTACK:
                channel.level = channel.attack === 0 ? 1 : channel.level + tick / channel.attack
                if (channel.level >= 1) {
                    channel.level = 1
                    channel.stage = DECAY
                }
                break
            case DECAY: {
                const sustain = channel.sustain / 127
                channel.level = channel.decay === 0 ? sustain : channel.level - tick / channel.decay
                if (channel.level <= sustain) {
                    channel.level = sustain
                    channel.stage = SUSTAIN
                }
                break
            }
            case SUSTAIN:
                channel.level = channel.sustain / 127
                break
            case RELEASE:
                channel.level = channel.release === 0 ? 0 : channel.level - tick / channel.release
                if (channel.level <= 0) {
                    channel.level = 0
                    channel.stage = IDLE
                }
                break
        }
        return channel.level
    }
}
