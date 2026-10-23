import { describe, expect, it } from 'vite-plus/test'
import type { AudioCommand, SoundData } from './AudioOutput'
import { PageAudio } from './audioContext'
import { createBrowserAudioOutput, SharedEngine } from './browserAudioOutput'
import type { ChipMessage } from './chips/chipMessages'
import type { ChipNode } from './chips/chipNode'
import { makeMidi, makeWav } from './soundFixtures'
import type { SynthesizerEngine } from './synthesizerEngine'
import { FakeAudioContext, FakeEngine } from './webAudioFakes'

/** A chip node that keeps what it is posted, made when the test lets it load. */
class FakeChipNode implements ChipNode {
    readonly messages: ChipMessage[] = []
    onReport: ChipNode['onReport'] = null
    disposed = false

    post(message: ChipMessage): void {
        this.messages.push(message)
    }

    dispose(): void {
        this.disposed = true
    }
}

function setup(
    options: { state?: AudioContextState; load?: () => Promise<SynthesizerEngine> } = {}
) {
    const context = new FakeAudioContext(options.state ?? 'running')
    const page = new PageAudio({ createContext: () => context.asContext, gestures: null })
    const engine = new FakeEngine()
    let loads = 0
    const shared = new SharedEngine(() => {
        loads++
        return options.load?.() ?? Promise.resolve(engine)
    })
    const chipNodes: { node: FakeChipNode; load: () => Promise<void> }[] = []
    const chips = () => {
        const node = new FakeChipNode()
        let load!: () => void
        const loaded = new Promise<ChipNode>((resolve) => (load = () => resolve(node)))
        chipNodes.push({ node, load: () => (load(), loaded.then(() => {})) })
        return loaded
    }
    const output = () => createBrowserAudioOutput({ page, engine: shared, chips })
    return { context, page, engine, output, loads: () => loads, chipNodes }
}

const wav: SoundData = { id: 1, kind: 'wav', bytes: makeWav({ lengthMs: 500 }) }
const midi: SoundData = { id: 2, kind: 'midi', bytes: makeMidi(4) }
const note = (voice: number, pitch = 60): AudioCommand => ({
    type: 'note',
    voice,
    pitch,
    instrument: 0,
    volume: 100,
    durationMs: 1000
})

describe('voices', () => {
    it('stops only its own sounds, though every output plays through the page', async () => {
        const { context, engine, output } = setup()
        const first = output()
        const second = output()
        await first.prepare({ kind: 'synthesizer' })
        await first.prepare({ kind: 'sound', sound: wav })
        first.send([note(1), { type: 'sound', voice: 2, sound: wav, loop: true }])
        second.send([note(1, 72)])
        expect(engine.voices.map((voice) => voice.what)).toEqual([
            'note 60 0 100 1000',
            'note 72 0 100 1000'
        ])
        expect(context.sources[0].loop).toBe(true)
        expect(context.sources[0].connections).toEqual([context.gains[0]])

        first.send([{ type: 'stopAll' }])
        expect(engine.voices[0].stoppedWith).toBe(true)
        expect(context.sources[0].stopped).toBe(true)
        expect(engine.voices[1].sounding()).toBe(true)
    })

    it('stops a voice by its number in its own output only', async () => {
        const { engine, output } = setup()
        const first = output()
        const second = output()
        await first.prepare({ kind: 'synthesizer' })
        first.send([note(5)])
        second.send([note(5)])
        second.send([{ type: 'stop', voice: 5 }])
        expect(engine.voices[0].sounding()).toBe(true)
        expect(engine.voices[1].stoppedWith).toBe(false)
    })

    it('forgets a WAV once it has played to its end', async () => {
        const { context, output } = setup()
        const audio = output()
        await audio.prepare({ kind: 'sound', sound: wav })
        audio.send([{ type: 'sound', voice: 1, sound: wav, loop: false }])
        context.sources[0].end()
        audio.send([{ type: 'stop', voice: 1 }])
        expect(context.sources[0].stopped).toBe(false)
    })
})

describe('WAV Sounds', () => {
    it('decodes a copy of the bytes once', async () => {
        const { context, output } = setup()
        const audio = output()
        const decoding = audio.prepare({ kind: 'sound', sound: wav })
        expect(decoding).toBeInstanceOf(Promise)
        expect(audio.prepare({ kind: 'sound', sound: wav })).toBe(decoding)
        await decoding
        expect(audio.prepare({ kind: 'sound', sound: wav })).toBeNull()
        expect(context.decodes).toHaveLength(1)
        expect(context.decodes[0]).not.toBe(wav.bytes.buffer)
        expect(new Uint8Array(context.decodes[0])).toEqual(wav.bytes)
    })

    it('plays nothing, and does not reject, when the browser cannot decode it', async () => {
        const { context, output } = setup()
        context.undecodable = true
        const audio = output()
        await expect(audio.prepare({ kind: 'sound', sound: wav })).resolves.toBeUndefined()
        audio.send([{ type: 'sound', voice: 1, sound: wav, loop: false }])
        expect(context.sources).toHaveLength(0)
    })
})

describe('the synthesizer', () => {
    it('loads once for every output', async () => {
        const { output, loads } = setup()
        const first = output()
        const second = output()
        const loading = first.prepare({ kind: 'synthesizer' })
        expect(loading).toBeInstanceOf(Promise)
        expect(second.prepare({ kind: 'synthesizer' })).toBeInstanceOf(Promise)
        await loading
        expect(first.prepare({ kind: 'synthesizer' })).toBeNull()
        expect(second.prepare({ kind: 'synthesizer' })).toBeNull()
        expect(loads()).toBe(1)
    })

    it('rejects every prepare when it cannot load, and never tries again', async () => {
        const { output, loads } = setup({ load: () => Promise.reject(new Error('HTTP 404')) })
        const first = output()
        const second = output()
        await expect(first.prepare({ kind: 'synthesizer' })).rejects.toThrow('HTTP 404')
        await expect(second.prepare({ kind: 'sound', sound: midi })).rejects.toThrow('HTTP 404')
        first.send([note(1)])
        expect(loads()).toBe(1)
    })

    it('readies a MIDI synthesizer after the engine', async () => {
        const { engine, output } = setup()
        const audio = output()
        let ready = false
        engine.midiReady = new Promise<void>((resolve) => setTimeout(resolve, 1)).then(() => {
            ready = true
        })
        await audio.prepare({ kind: 'sound', sound: midi })
        expect(ready).toBe(true)
        engine.midiReady = null
        expect(audio.prepare({ kind: 'sound', sound: midi })).toBeNull()
        audio.send([{ type: 'sound', voice: 1, sound: midi, loop: false }])
        expect(engine.voices.map((voice) => voice.what)).toEqual(['midi 2000'])
    })

    it('drops a Note sent before the synthesizer loaded', () => {
        const { engine, output } = setup()
        output().send([note(1)])
        expect(engine.voices).toHaveLength(0)
    })
})

describe('autoplay', () => {
    it('drops what starts while the browser holds the context back, and plays after a wake', async () => {
        const { context, page, engine, output } = setup({ state: 'suspended' })
        const audio = output()
        await audio.prepare({ kind: 'synthesizer' })
        audio.send([note(1)])
        expect(engine.voices).toHaveLength(0)
        page.wake()
        audio.send([note(2)])
        expect(engine.voices).toHaveLength(1)
        expect(context.state).toBe('running')
    })
})

describe('chips', () => {
    const write = (register: number, value: number): AudioCommand => ({
        type: 'synth',
        writes: [register, value]
    })

    it('keeps what is sent before the node runs, and posts it in order once it does', async () => {
        const { output, chipNodes } = setup()
        const audio = output()
        audio.send([write(0x10, 1)])
        audio.send([write(0x10, 0), { type: 'soundChip', writes: [8, 15] }])
        expect(chipNodes).toHaveLength(1)
        await chipNodes[0].load()
        audio.send([write(0x12, 100)])
        expect(chipNodes[0].node.messages).toEqual([
            {
                type: 'commands',
                commands: [write(0x10, 1), write(0x10, 0), { type: 'soundChip', writes: [8, 15] }]
            },
            { type: 'commands', commands: [write(0x12, 100)] }
        ])
    })

    it('disposes of the node on Stop, and makes a new one for the next program', async () => {
        const { output, chipNodes } = setup()
        const audio = output()
        audio.send([write(0x10, 1)])
        await chipNodes[0].load()
        audio.send([{ type: 'stopAll' }])
        expect(chipNodes[0].node.disposed).toBe(true)
        audio.send([write(0x10, 1)])
        expect(chipNodes).toHaveLength(2)
    })

    it('disposes of a node that loads after the Stop, posting nothing to it', async () => {
        const { output, chipNodes } = setup()
        const audio = output()
        audio.send([write(0x10, 1)])
        audio.send([{ type: 'stopAll' }])
        await chipNodes[0].load()
        expect(chipNodes[0].node.disposed).toBe(true)
        expect(chipNodes[0].node.messages).toEqual([])
    })

    it('keeps the chips’ state while the browser holds the context back', async () => {
        const { output, chipNodes } = setup({ state: 'suspended' })
        const audio = output()
        audio.send([write(0x10, 1)])
        await chipNodes[0].load()
        expect(chipNodes[0].node.messages).toHaveLength(1)
    })

    it('gives each output a node of its own', () => {
        const { output, chipNodes } = setup()
        output().send([write(0x10, 1)])
        output().send([write(0x10, 1)])
        expect(chipNodes).toHaveLength(2)
    })
})
