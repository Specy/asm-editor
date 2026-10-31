import { describe, expect, it } from 'vite-plus/test'
import { Audio } from './Audio'
import { RecordingAudioOutput, type AudioCommand } from './AudioOutput'

function setup(options: { silent?: boolean } = {}) {
    let time = 0
    const output = new RecordingAudioOutput()
    const audio = new Audio({ clock: { now: () => time }, output, silent: options.silent })
    return { audio, x86: audio.x86, output, at: (ms: number) => (time = ms) }
}

/** Program time in Blink's nanoseconds. */
const ns = (ms: number) => BigInt(Math.round(ms * 1e6))
const stereo = (frames: number, value = 0.5) => new Float32Array(frames * 2).fill(value)
const types = (commands: AudioCommand[]) => commands.map((command) => command.type)

describe("x86's sound timeline", () => {
    it('sends each event in Program milliseconds, behind the Program time the batch leaves at', () => {
        const { audio, x86, output, at } = setup()
        const frames = stereo(800)
        x86.pcm({ start: ns(250), rate: 8000, frames })
        x86.midi({ at: ns(1.5), message: Uint8Array.of(0x90, 60, 100) })
        x86.tone({ at: ns(2), hz: 440.2885 })
        at(3)
        audio.flush()
        expect(output.batches).toEqual([
            [
                { type: 'programTime', now: 3 },
                { type: 'pcm', start: 250, rate: 8000, frames: expect.any(Float32Array) },
                { type: 'midi', at: 1.5, message: Uint8Array.of(0x90, 60, 100) },
                { type: 'tone', at: 2, hz: 440.2885 }
            ]
        ])
        const sent = output.commands[1] as Extract<AudioCommand, { type: 'pcm' }>
        //a copy of its own, which the output hands over to the audio thread
        expect(sent.frames).not.toBe(frames)
        expect(sent.frames).toEqual(frames)
        audio.flush()
        expect(output.batches).toHaveLength(1)
    })

    it('drops the real-time bytes the synthesizer ignores', () => {
        const { audio, x86, output } = setup()
        x86.midi({ at: 0n, message: Uint8Array.of(0xf8) })
        x86.midi({ at: 0n, message: Uint8Array.of(0xfe) })
        audio.flush()
        expect(output.batches).toEqual([])
    })

    it('sends nothing for a program that sets its mixer, cuts or silences without a sound', () => {
        const { audio, x86, output } = setup()
        x86.mixer({ volume: [75, 75], pcm: [100, 100] })
        x86.tone({ at: 0n, hz: 0 })
        x86.soundCut({ after: 0n })
        audio.stopLoops()
        audio.flush()
        expect(output.batches).toEqual([])
        expect(audio.activity.soundsStarted).toBe(0)
    })

    it("gains /dev/dsp by the mixer's VOLUME × PCM, from the first samples and at each change", () => {
        const { audio, x86, output, at } = setup()
        x86.mixer({ volume: [50, 100], pcm: [50, 40] })
        at(10)
        x86.pcm({ start: ns(10), rate: 8000, frames: stereo(80) })
        x86.mixer({ volume: [50, 100], pcm: [50, 40] })
        at(20)
        x86.mixer({ volume: [0, 150], pcm: [100, 100] })
        audio.flush()
        expect(output.commands.filter((command) => command.type === 'pcmGain')).toEqual([
            { type: 'pcmGain', at: 10, left: 0.25, right: 0.4 },
            { type: 'pcmGain', at: 20, left: 0, right: 1 }
        ])
        expect(types(output.commands).indexOf('pcmGain')).toBeLessThan(
            types(output.commands).indexOf('pcm')
        )
    })

    it('passes a cut on once something sounded, for one device or for all', () => {
        const { audio, x86, output } = setup()
        x86.tone({ at: 0n, hz: 1000 })
        x86.soundCut({ after: ns(5), device: 'dsp' })
        x86.soundCut({ after: ns(6) })
        audio.flush()
        expect(output.commands.slice(2)).toEqual([
            { type: 'cut', after: 5, device: 'dsp' },
            { type: 'cut', after: 6 }
        ])
    })

    it('ends the program at its own end, and forgets the run on Build, Stop and dispose', () => {
        const { audio, x86, output, at } = setup()
        x86.midi({ at: 0n, message: Uint8Array.of(0xc0, 1) })
        at(40)
        audio.stopLoops()
        expect(output.commands.at(-1)).toEqual({ type: 'programEnd', at: 40 })
        audio.reset()
        expect(output.batches.at(-1)).toEqual([{ type: 'stopAll' }])
        x86.soundCut({ after: 0n })
        audio.stopLoops()
        expect(output.batches.at(-1)).toEqual([{ type: 'stopAll' }])
    })

    it('leaves Undo to the Core: undoing an instruction sends nothing for x86', () => {
        const { audio, x86, output } = setup()
        let position: number | null = 1
        audio.track(() => position, 10)
        x86.tone({ at: 0n, hz: 1000 })
        position = null
        audio.flush()
        const before = output.commands.length
        audio.undoAfter(0)
        expect(output.commands).toHaveLength(before)
    })
})

describe('the activity the dock reads', () => {
    it('counts sounds started and lights for as long as /dev/dsp has samples', () => {
        const { audio, x86, at } = setup()
        x86.pcm({ start: 0n, rate: 8000, frames: stereo(8000) })
        //the next fragment continues the same sound
        x86.pcm({ start: ns(1000), rate: 8000, frames: stereo(8000) })
        audio.flush()
        at(500)
        expect(audio.activity).toEqual({ soundsStarted: 1, loading: false, playingForMs: 1500 })
        at(2000)
        expect(audio.activity.playingForMs).toBe(0)
    })

    it('stays lit while a tone sounds or a MIDI note is held', () => {
        const { audio, x86 } = setup()
        x86.tone({ at: 0n, hz: 1000 })
        expect(audio.activity.playingForMs).toBe(Infinity)
        x86.tone({ at: 0n, hz: 0 })
        expect(audio.activity.playingForMs).toBe(0)
        x86.midi({ at: 0n, message: Uint8Array.of(0x91, 60, 100) })
        expect(audio.activity.playingForMs).toBe(Infinity)
        x86.midi({ at: ns(10), message: Uint8Array.of(0x91, 60, 0) })
        expect(audio.activity.playingForMs).toBe(1010)
        x86.midi({ at: ns(10), message: Uint8Array.of(0x92, 64, 100) })
        x86.midi({ at: ns(10), message: Uint8Array.of(0xb2, 123, 0) })
        expect(audio.activity.playingForMs).toBe(1010)
        expect(audio.activity.soundsStarted).toBe(3)
    })

    it('goes out at the end of the program, but for what /dev/dsp still plays', () => {
        const { audio, x86 } = setup()
        x86.tone({ at: 0n, hz: 1000 })
        x86.midi({ at: 0n, message: Uint8Array.of(0x90, 60, 100) })
        x86.pcm({ start: 0n, rate: 8000, frames: stereo(16_000) })
        audio.stopLoops()
        expect(audio.activity.playingForMs).toBe(2000)
    })
})

describe('in a Testcase', () => {
    it('sends nothing and plays nothing, whatever the Core reports', () => {
        const { audio, x86, output } = setup({ silent: true })
        x86.pcm({ start: 0n, rate: 8000, frames: stereo(8000) })
        x86.midi({ at: 0n, message: Uint8Array.of(0x90, 60, 100) })
        x86.tone({ at: 0n, hz: 1000 })
        x86.mixer({ volume: [50, 50], pcm: [50, 50] })
        x86.soundCut({ after: 0n })
        audio.stopLoops()
        audio.flush()
        expect(output.batches).toEqual([])
        expect(audio.activity).toEqual({ soundsStarted: 0, loading: false, playingForMs: 0 })
        expect(audio.prepare('midiPort')).toBeNull()
    })
})

describe("holding for the MIDI port's synthesizer", () => {
    it('asks the output for it, and lets the program go once it is ready', async () => {
        const { audio, output } = setup()
        output.holdPrepare = true
        const holding = audio.prepare('midiPort')
        expect(output.prepared).toEqual([{ kind: 'midiPort' }])
        expect(audio.activity.loading).toBe(true)
        output.settle()
        await holding
        expect(audio.activity.loading).toBe(false)
    })
})
