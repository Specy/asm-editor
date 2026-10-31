import { describe, expect, it } from 'vite-plus/test'
import { LATE_NOTE_S, MIDI_LOOKAHEAD_S, MidiPortScheduler } from './midiPort'
import { ProgramTimeline, TIMELINE_LATENCY_S } from './programTimeline'
import { FakeMidiPort } from './webAudioFakes'

/** A scheduler on a timeline anchored at Program 0 = output 0, so output time is Program time plus the latency. */
function setup() {
    let now = 0
    const timeline = new ProgramTimeline()
    timeline.observe(0, 0)
    const scheduler = new MidiPortScheduler(timeline, () => now)
    const port = new FakeMidiPort()
    return {
        scheduler,
        port,
        /** Moves the output clock to `seconds` and hands over what is due. */
        pump(seconds: number) {
            now = seconds
            scheduler.pump()
        }
    }
}

const L = TIMELINE_LATENCY_S
const noteOn = (key: number, channel = 0) => Uint8Array.of(0x90 | channel, key, 100)
const noteOff = (key: number, channel = 0) => Uint8Array.of(0x80 | channel, key, 0)

describe('the raw MIDI port', () => {
    it('hands each message over just before it is due, at its time on the output clock', () => {
        const { scheduler, port, pump } = setup()
        scheduler.attach(port)
        scheduler.send(0, Uint8Array.of(0xc0, 40))
        scheduler.send(0, noteOn(60))
        scheduler.send(500, noteOff(60))
        pump(0)
        expect(port.sent).toEqual([])
        pump(L - MIDI_LOOKAHEAD_S + 0.001)
        expect(port.sent).toEqual([
            { message: [0xc0, 40], time: L },
            { message: [0x90, 60, 100], time: L }
        ])
        expect(scheduler.pending).toBe(true)
        pump(0.5 + L - MIDI_LOOKAHEAD_S + 0.001)
        expect(port.sent.at(-1)).toEqual({ message: [0x80, 60, 0], time: 0.5 + L })
        expect(scheduler.pending).toBe(false)
    })

    it('passes SysEx whole, its F0 and F7 included', () => {
        const { scheduler, port, pump } = setup()
        scheduler.attach(port)
        const masterVolume = Uint8Array.of(0xf0, 0x7f, 0x7f, 0x04, 0x01, 0x00, 0x40, 0xf7)
        scheduler.send(0, masterVolume)
        pump(L)
        expect(port.sent).toEqual([{ message: [...masterVolume], time: L }])
    })

    it('waits for its synthesizer, then plays what is late at once, but for its notes', () => {
        const { scheduler, port, pump } = setup()
        scheduler.send(0, Uint8Array.of(0xc0, 40))
        scheduler.send(0, noteOn(60))
        scheduler.send(900, noteOn(62))
        expect(scheduler.pending).toBe(false)
        pump(1)
        scheduler.attach(port)
        //the program change still matters; a note a second late would only be a burst
        expect(port.sent.map((sent) => sent.message)).toEqual([
            [0xc0, 40],
            [0x90, 62, 100]
        ])
        expect(1 - (0.9 + L)).toBeLessThan(LATE_NOTE_S)
    })

    it('drops what a cut drops, and stops the notes handed over after it', () => {
        const { scheduler, port, pump } = setup()
        scheduler.attach(port)
        scheduler.send(0, noteOn(60))
        scheduler.send(40, noteOn(64))
        scheduler.send(1000, noteOff(60))
        scheduler.send(1000, noteOff(64))
        pump(L - MIDI_LOOKAHEAD_S + 0.05)
        expect(port.sent).toHaveLength(2)
        //an Undo at Program 20 ms: the second note was handed over and is not due yet
        scheduler.cut(20)
        expect(port.sent.at(-1)).toEqual({ message: [0x80, 64, 0], time: 0.04 + L })
        pump(2)
        expect(port.sent).toHaveLength(3)
        expect(scheduler.pending).toBe(false)
    })

    it('releases every note at the end, once what the port had queued has gone out', () => {
        const { scheduler, port, pump } = setup()
        scheduler.attach(port)
        scheduler.send(0, noteOn(60))
        scheduler.send(1200, noteOn(62, 9))
        scheduler.end(300)
        pump(0.05)
        pump(1.25)
        const offs = port.sent.slice(2)
        expect(offs).toHaveLength(16)
        expect(offs.every((sent) => sent.time === 1.2 + L)).toBe(true)
        expect(offs.map((sent) => sent.message)).toEqual(
            Array.from({ length: 16 }, (_, channel) => [0xb0 | channel, 123, 0])
        )
    })

    it('never hands a message over before one already handed, though the timeline slews back', () => {
        const timeline = new ProgramTimeline()
        timeline.observe(0, 0)
        const scheduler = new MidiPortScheduler(timeline, () => 1.05)
        const port = new FakeMidiPort()
        scheduler.attach(port)
        scheduler.send(1000, noteOn(60))
        scheduler.pump()
        //the context was suspended: the mapping jumps back by half a second
        timeline.observe(2000, 1.5)
        scheduler.send(1010, noteOff(60))
        scheduler.pump()
        expect(port.sent.map((sent) => sent.time)).toEqual([1 + L, 1 + L])
        expect(port.sent.map((sent) => sent.message[0])).toEqual([0x90, 0x80])
    })

    it('gives its synthesizer back on Stop, and plays nothing more', () => {
        const { scheduler, port, pump } = setup()
        scheduler.attach(port)
        scheduler.send(500, noteOn(60))
        port.voices = 1
        expect(scheduler.sounding()).toBe(true)
        scheduler.stop()
        expect(port.released).toBe(true)
        scheduler.send(600, noteOn(61))
        pump(2)
        expect(port.sent).toEqual([])
        expect(scheduler.sounding()).toBe(false)
        const late = new FakeMidiPort()
        scheduler.attach(late)
        expect(late.released).toBe(true)
    })
})
