import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { loadSynthesizerEngine } from './synthesizerEngine'
import { FakeAudioContext, FakeNode } from './webAudioFakes'

/**
 * spessasynth_lib stood in for by synthesizers that log what is asked of them, in order, so the
 * tests can pin what the worklet would receive. A channel `addNewChannel` makes starts with every
 * controller at 0, silent, until a reset gives it the defaults, which is what these orders guard.
 */
const lib = vi.hoisted(() => {
    const log: string[] = []
    let made = 0
    class WorkletSynthesizer {
        readonly name = `synth${made++}`
        readonly isReady = Promise.resolve()
        readonly midiChannels = Array.from({ length: 64 }, (_, channel) => ({
            setDrums: (drums: boolean) => log.push(`${this.name} setDrums ${channel} ${drums}`)
        }))
        readonly soundBankManager = {
            addSoundBank: async () => void log.push(`${this.name} bank`)
        }
        readonly eventHandler = { addEvent: () => {} }
        addNewChannel() {
            log.push(`${this.name} addNewChannel`)
        }
        reset() {
            log.push(`${this.name} reset`)
        }
        connect() {}
        disconnect() {}
        programChange() {}
        noteOn() {}
        noteOff() {}
        controllerChange() {}
        stopAll() {}
    }
    class Sequencer {
        loopCount = 0
        readonly eventHandler = { addEvent: () => {} }
        constructor(private readonly synth: WorkletSynthesizer) {}
        loadNewSongList() {
            log.push(`${this.synth.name} load`)
        }
        play() {
            log.push(`${this.synth.name} play`)
        }
        pause() {}
    }
    return { log, WorkletSynthesizer, Sequencer }
})
vi.mock('spessasynth_lib', () => ({
    WorkletSynthesizer: lib.WorkletSynthesizer,
    Sequencer: lib.Sequencer
}))

/** A context with a worklet, and a bank that arrives. */
function loadable() {
    vi.stubGlobal('fetch', async () => new Response(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0])))
    const context = Object.assign(new FakeAudioContext(), {
        audioWorklet: { addModule: async () => {} }
    })
    return loadSynthesizerEngine(context.asContext, new FakeNode() as unknown as AudioNode)
}

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('loading the synthesizer', () => {
    it('fetches its worklet and its bank as assets, and rejects when the bank does not come', async () => {
        const modules: string[] = []
        const context = Object.assign(new FakeAudioContext(), {
            audioWorklet: { addModule: async (url: string) => void modules.push(url) }
        })
        const fetched: string[] = []
        vi.stubGlobal('fetch', async (url: string) => {
            fetched.push(url)
            return new Response(null, { status: 404 })
        })
        await expect(
            loadSynthesizerEngine(context.asContext, new FakeNode() as unknown as AudioNode)
        ).rejects.toThrow('HTTP 404')
        expect(modules).toEqual([expect.stringMatching(/spessasynth_processor\.min\.js$/)])
        expect(fetched).toEqual([expect.stringMatching(/soundbank-emg\.sf2$/)])
    })
})

describe('the channels every Note can take', () => {
    it('adds 48 channels to the first 16 once the bank is in, resets them all, then makes them melodic', async () => {
        lib.log.length = 0
        await loadable()
        const notes = lib.log.filter((entry) => entry.startsWith(lib.log[0].split(' ')[0]))
        const name = notes[0].split(' ')[0]
        expect(notes[0]).toBe(`${name} bank`)
        expect(notes.slice(1, 49)).toEqual(Array(48).fill(`${name} addNewChannel`))
        expect(notes[49]).toBe(`${name} reset`)
        //after the reset, which makes every sixteenth channel a drum channel again
        expect(notes.slice(50)).toEqual(
            Array.from({ length: 64 }, (_, channel) => `${name} setDrums ${channel} false`)
        )
    })
})

describe('the synthesizer of a MIDI Sound', () => {
    it('has four ports of channels, reset, before its first song loads', async () => {
        const engine = await loadable()
        lib.log.length = 0
        await engine.prepareMidi()
        engine.playMidi(new Uint8Array([1]), false, 1000)
        const name = lib.log[0].split(' ')[0]
        expect(lib.log).toEqual([
            `${name} bank`,
            ...Array(48).fill(`${name} addNewChannel`),
            `${name} reset`,
            `${name} load`,
            `${name} play`
        ])
    })
})
