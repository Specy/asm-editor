import type { TimelineCommand, TimelineDevice } from './AudioOutput'

/**
 * The sound a program streams on **Program time**, as the **Audio** Peripheral takes it from the
 * devices that make it: x86's `/dev/dsp`, raw MIDI port, PC speaker and mixer, which Blink keeps
 * ([x86-devices.md](../../../../../../../docs/design/x86-devices.md)), and the **MIDI port** and
 * **Sampled-audio output** of MIPS and RISC-V, which `MarsDevices` models
 * ([ADR 0075](../../../../../../../docs/adr/0075-mips-and-risc-v-get-a-midi-port-and-a-sampled-audio-output.md)).
 * Each event carries the Program time it is heard at, in milliseconds. The devices decide
 * everything a program can observe, their buffers, their draining and what Undo takes back, so
 * nothing here answers the program: this turns their events into the output's batch and keeps what
 * the dock's speaker button reads.
 *
 * - **Silent** in a Testcase: the devices keep their timing on the virtual clock, and nothing
 *   reaches an output.
 * - **Undo** needs no journal here: the device sends a cut, then what puts the tone, the mixer and
 *   the MIDI channels back, which play as any other event does.
 * - **Lazy**: the mixer, a cut, a silent tone and a program's end reach the output only once the
 *   program has made a sound, so a program that sets its mixer and plays nothing loads nothing.
 * - **The mixer** is a gain on the samples alone, VOLUME × PCM for each side as linear amplitudes,
 *   from the moment it changes; the user's mute and volume act after it, on the page's master gain.
 *
 * Owned by `Audio` as `audio.timeline`; plain TypeScript, so it runs under node.
 */

/** Samples heard from `start`, stereo and interleaved, `rate` frames a second. */
export type TimelinePcmEvent = { start: number; rate: number; frames: Float32Array }
/** One complete MIDI message, a SysEx with its F0 and F7, leaving a MIDI port at `at`. */
export type TimelineMidiEvent = { at: number; message: Uint8Array }
/** A square-wave tone from `at`, in Hz; 0 is silence. */
export type TimelineToneEvent = { at: number; hz: number }
export type TimelineMixerEvent = {
    volume: readonly [number, number]
    pcm: readonly [number, number]
}
/** Everything due after `after` dropped, on `device` or on every device. */
export type TimelineCut = { after: number; device?: TimelineDevice }

/** What `TimelineSound` needs of the Audio it belongs to. */
export type TimelineSoundHost = {
    readonly silent: boolean
    /** Program time, in milliseconds. */
    now(): number
    /** Adds a command to the batch the next flush sends. */
    send(command: TimelineCommand): void
    /** A sound started, which the dock counts. */
    started(): void
}

/** Blink's nanoseconds of Program time in the timeline's milliseconds. */
export function fromNanoseconds(nanoseconds: bigint): number {
    return Number(nanoseconds) / 1e6
}

/** How long the dock's light stays on after the last MIDI message, for its release. */
const MIDI_TAIL_MS = 1000
const ALL_SOUND_OFF = 120
const ALL_NOTES_OFF = 123

/** A mixer level, 0 to 100, as a linear gain. */
function level(value: number): number {
    return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) / 100 : 1
}

export class TimelineSound {
    /** Whether a sound has gone to the output since the last reset. */
    private sounded = false
    /** The samples' gain as x86's mixer sets it, and as the output last heard it. */
    private gain = { left: 1, right: 1 }
    private sentGain = { left: 1, right: 1 }
    /** Program time the last samples sent end at. */
    private pcmEnd = -Infinity
    private midiUntil = -Infinity
    /** Notes held by the MIDI messages sent, by channel × 128 + key, for the dock's light. */
    private readonly held = new Set<number>()
    private toneHz = 0

    constructor(private readonly host: TimelineSoundHost) {}

    /** Samples heard from `start`, stereo and interleaved, at `rate`. */
    pcm(event: TimelinePcmEvent): void {
        if (this.host.silent) return
        const { start, rate, frames } = event
        if (!(rate > 0) || frames.length < 2) return
        this.sounded = true
        this.sendGain()
        if (start > this.pcmEnd) this.host.started()
        this.pcmEnd = Math.max(this.pcmEnd, start + ((frames.length >> 1) / rate) * 1000)
        //a copy of its own, which the output hands over to the audio thread
        this.host.send({ type: 'pcm', start, rate, frames: frames.slice() })
    }

    /**
     * One complete message leaving a MIDI port at `at`. Real-time bytes, clock and transport among
     * them, are dropped here: the synthesizer ignores them.
     */
    midi(event: TimelineMidiEvent): void {
        if (this.host.silent) return
        const { at, message } = event
        if (message.length === 0 || message[0] >= 0xf8) return
        this.sounded = true
        this.follow(message)
        this.midiUntil = Math.max(this.midiUntil, at + MIDI_TAIL_MS)
        this.host.send({ type: 'midi', at, message: message.slice() })
    }

    /** x86's PC speaker: its tone from `at`, in Hz; 0 is silence. */
    tone(event: TimelineToneEvent): void {
        if (this.host.silent) return
        const hz = Number.isFinite(event.hz) && event.hz > 0 ? event.hz : 0
        if (hz > 0 && this.toneHz === 0) this.host.started()
        this.toneHz = hz
        if (hz === 0 && !this.sounded) return
        this.sounded = true
        this.host.send({ type: 'tone', at: event.at, hz })
    }

    /** x86's mixer: the program's levels, 0 to 100 a side, from now. */
    mixer(event: TimelineMixerEvent): void {
        if (this.host.silent) return
        this.gain = {
            left: level(event.volume[0]) * level(event.pcm[0]),
            right: level(event.volume[1]) * level(event.pcm[1])
        }
        if (this.sounded) this.sendGain()
    }

    /** Everything due after `after` dropped, on `device` or every device: an Undo, a reset. */
    cut(cut: TimelineCut): void {
        if (this.host.silent || !this.sounded) return
        const { after, device } = cut
        if (device === undefined || device === 'dsp') this.pcmEnd = Math.min(this.pcmEnd, after)
        //the notes a cut stops are not known here; better a light out early than one left on
        if (device === undefined || device === 'midi') {
            this.held.clear()
            this.midiUntil = Math.min(this.midiUntil, after + MIDI_TAIL_MS)
        }
        this.host.send(
            device === undefined ? { type: 'cut', after } : { type: 'cut', after, device }
        )
    }

    /**
     * The program ended on its own: the speaker falls silent and a MIDI port releases its notes once
     * its queue is out, while the samples play out.
     */
    end(): void {
        this.held.clear()
        this.toneHz = 0
        if (this.host.silent || !this.sounded) return
        this.host.send({ type: 'programEnd', at: this.host.now() })
    }

    /** Build, Stop, dispose: the output silences itself on `stopAll`, and this forgets the run. */
    reset(): void {
        this.sounded = false
        this.gain = { left: 1, right: 1 }
        this.sentGain = { left: 1, right: 1 }
        this.pcmEnd = -Infinity
        this.midiUntil = -Infinity
        this.held.clear()
        this.toneHz = 0
    }

    /** Program time until which something is heard; Infinity while a tone or a MIDI note holds. */
    playingUntil(): number {
        if (this.toneHz > 0 || this.held.size > 0) return Infinity
        return Math.max(this.pcmEnd, this.midiUntil)
    }

    /** Tells the output the mixer's gain, from now, if it has not heard it yet. */
    private sendGain(): void {
        const { left, right } = this.gain
        if (left === this.sentGain.left && right === this.sentGain.right) return
        this.sentGain = this.gain
        this.host.send({ type: 'pcmGain', at: this.host.now(), left, right })
    }

    /** Follows which notes the messages hold, for the dock's light. */
    private follow(message: Uint8Array): void {
        const status = message[0] & 0xf0
        const channel = message[0] & 0x0f
        const key = message[1] ?? 0
        if (status === 0x90 && (message[2] ?? 0) > 0) {
            if (!this.held.has(channel * 128 + key)) this.host.started()
            this.held.add(channel * 128 + key)
        } else if (status === 0x80 || status === 0x90) {
            this.held.delete(channel * 128 + key)
        } else if (status === 0xb0 && (key === ALL_SOUND_OFF || key >= ALL_NOTES_OFF)) {
            for (const note of [...this.held]) if (note >> 7 === channel) this.held.delete(note)
        }
    }
}
