import type { ProgramTimeline } from './programTimeline'

/**
 * A MIDI port as the output plays it, x86's raw one ([x86-devices.md](../../../../../../../docs/design/x86-devices.md#the-raw-midi-port))
 * or the MIDI port of MIPS and RISC-V: the messages the device lets out of the port, Blink or
 * `MarsDevices`, each at its Program time, handed to a General MIDI synthesizer of the port's own at
 * the output time the timeline maps that to.
 *
 * spessasynth schedules a message given a time, but keeps it until then and has no way to take it
 * back, while a cut has to drop what is still to come. So the messages wait here, and each is handed
 * over only `MIDI_LOOKAHEAD_S` before it is due, by `pump()`: at every batch, and on a timer while
 * any wait. Of what was handed over already, a cut stops the notes it would start, with a note-off at
 * the same time; and since the lookahead is shorter than the timeline's latency, everything handed
 * over before a cut is due before whatever the Core sends after it, the channel settings an Undo puts
 * back among them.
 *
 * - A message late by more than `LATE_NOTE_S`, sent while the synthesizer was still loading, is
 *   played at once, in order, except for a note-on: a burst of every note of the last seconds would be
 *   worse than the few missing, and a channel's program or controllers have to arrive whatever their
 *   time. A program holding while the bank loads (`Audio.prepare('midiPort')`) never gets here.
 * - At the program's end, once what the port had queued has gone out, All Notes Off on every channel
 *   releases each note still held, sustained ones too, so they fade rather than ring on
 *   ([x86-devices.md](../../../../../../../docs/design/x86-devices.md#the-midi-port-under-undo-in-a-testcase-at-the-end-and-between-runs)).
 * - Stop hands the synthesizer back, which silences it at once and resets it with GM System On
 *   before anyone takes it again (`synthesizerEngine.ts`), so every run starts from General MIDI's
 *   defaults.
 *
 * Plain TypeScript: the tests run it under node with a fake synthesizer.
 */

/** How long before it is due a message is handed to the synthesizer: past a slice, short of the latency. */
export const MIDI_LOOKAHEAD_S = 0.075
/** How often the messages still waiting are handed over while the main thread is free. */
export const MIDI_PUMP_MS = 20
/** How late a note-on may be and still be played. */
export const LATE_NOTE_S = 0.25
/** The channels of one port. */
export const PORT_CHANNELS = 16
const ALL_NOTES_OFF = 123

/** One port's synthesizer, as the engine lends it to an output for a run. */
export type MidiPortSynthesizer = {
    /** The promise of its bank, or null once it is in; messages sent meanwhile play after it. */
    whenReady(): Promise<void> | null
    /** Plays one complete message at `time` on the output's clock, at once if that has passed. */
    send(message: Uint8Array, time: number): void
    /** Whether a note may still be heard. */
    sounding(): boolean
    /** Silences it at once and gives it back; nothing sent to it afterwards plays. */
    release(): void
}

type Waiting = { readonly at: number; readonly message: Uint8Array }
type HandedNote = { readonly time: number; readonly channel: number; readonly key: number }

function isNoteOn(message: Uint8Array): boolean {
    return (message[0] & 0xf0) === 0x90 && message.length > 2 && message[2] > 0
}

export class MidiPortScheduler {
    private waiting: Waiting[] = []
    /** Note-ons handed over and not yet due, which a cut stops. */
    private handed: HandedNote[] = []
    private port: MidiPortSynthesizer | null = null
    /** Program time of the last message queued, after which the program's end releases the notes. */
    private lastAt = -Infinity
    /** Output time of the last message handed over, which nothing handed after it may precede. */
    private lastHanded = -Infinity
    private stopped = false

    /**
     * @param timeline Program time to the output's clock.
     * @param now The output's clock, in seconds.
     */
    constructor(
        private readonly timeline: ProgramTimeline,
        private readonly now: () => number
    ) {}

    /** The synthesizer, once it is there: what waits is handed over from then on. */
    attach(port: MidiPortSynthesizer): void {
        if (this.stopped) return port.release()
        this.port = port
        this.pump()
    }

    /** Queues one complete message leaving the port at `at`, in Program milliseconds. */
    send(at: number, message: Uint8Array): void {
        if (this.stopped) return
        this.waiting.push({ at, message })
        this.lastAt = Math.max(this.lastAt, at)
    }

    /** The program ended at `at`: every note still held is released once the port's queue is out. */
    end(at: number): void {
        const after = Math.max(at, this.lastAt)
        for (let channel = 0; channel < PORT_CHANNELS; channel++) {
            this.send(after, Uint8Array.of(0xb0 | channel, ALL_NOTES_OFF, 0))
        }
    }

    /** Drops every message due after `after`, in Program milliseconds, and stops the notes handed over after it. */
    cut(after: number): void {
        if (this.stopped) return
        this.waiting = this.waiting.filter((waiting) => waiting.at <= after)
        this.lastAt = this.waiting.at(-1)?.at ?? Math.min(this.lastAt, after)
        const time = this.timeline.toOutput(after)
        const kept: HandedNote[] = []
        for (const note of this.handed) {
            if (note.time <= time) kept.push(note)
            else this.port?.send(Uint8Array.of(0x80 | note.channel, note.key, 0), note.time)
        }
        this.handed = kept
    }

    /** Hands over what is due within the lookahead. */
    pump(): void {
        const port = this.port
        if (port === null || this.stopped) return
        const now = this.now()
        this.handed = this.handed.filter((note) => note.time > now)
        let handed = 0
        for (const { at, message } of this.waiting) {
            //never before what was handed over already, even once the timeline has slewed back
            const time = Math.max(this.timeline.toOutput(at), this.lastHanded)
            if (time >= now + MIDI_LOOKAHEAD_S) break
            handed++
            if (isNoteOn(message)) {
                if (time < now - LATE_NOTE_S) continue
                if (time > now)
                    this.handed.push({ time, channel: message[0] & 0x0f, key: message[1] })
            }
            port.send(message, time)
            this.lastHanded = time
        }
        if (handed > 0) this.waiting.splice(0, handed)
    }

    /** Whether messages wait to be handed over, for which the owner keeps pumping. */
    get pending(): boolean {
        return this.port !== null && !this.stopped && this.waiting.length > 0
    }

    /** Whether the port may still be heard: messages to come or notes sounding. */
    readonly sounding = (): boolean =>
        !this.stopped && (this.waiting.length > 0 || (this.port?.sounding() ?? false))

    /** Stop, Build or dispose: nothing more plays, and the synthesizer goes back silenced. */
    stop(): void {
        this.stopped = true
        this.waiting = []
        this.handed = []
        this.port?.release()
        this.port = null
    }
}
