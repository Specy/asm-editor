import type { AudioCommand, AudioNeed, AudioOutput, ChipCommand, SoundData } from './AudioOutput'
import { pageAudio, type AudioRoute, type PageAudio } from './audioContext'
import type { ChipNode } from './chips/chipNode'
import { inspectSoundFile } from './soundFiles'
import type { EngineVoice, SynthesizerEngine } from './synthesizerEngine'

/**
 * Where **Audio** becomes sound in a browser ([the plan](../../../../../../../docs/design/audio-plan.md),
 * M3). One output per Emulator; every output plays through the page's context and its master gain
 * and shares the page's one synthesizer, while keeping its own voices, so that a Stop or a Build
 * silences only its own program and a voice number means something only to the Audio that sent it.
 *
 * - **WAV Sounds** are decoded from a copy of their bytes, once per `SoundData`, and play as
 *   `AudioBufferSourceNode`s into the master gain, looping when asked.
 * - **Notes** and **MIDI Sounds** play on the synthesizer (`synthesizerEngine.ts`), whose module,
 *   worklet and bank are fetched on the first `prepare` that needs them. A load that fails stays
 *   failed for the rest of the page, and every output's `prepare` rejects with it, which Audio turns
 *   into one note in the Log.
 * - A WAV that will not decode plays nothing, without rejecting: a rejection tells Audio the bank did
 *   not load, which would silence the Notes too.
 * - **Chips**, the Synth and the Sound chip, play on a worklet node of the output's own, made on
 *   their first command ([the plan](../../../../../../../docs/design/waveform-sound-plan.md),
 *   decisions 5 and 6). A chip is a state, so what is sent before the node runs is kept and played
 *   once it does, and nothing waits for it; Stop, Build and dispose dispose of the node.
 */

/** The page's synthesizer engine, loaded on the first need for it and shared by every output. */
export class SharedEngine {
    private loading: Promise<SynthesizerEngine> | null = null
    /** The engine, once it has loaded. */
    loaded: SynthesizerEngine | null = null

    constructor(private readonly load: (route: AudioRoute) => Promise<SynthesizerEngine>) {}

    /** The promise of the engine, or null once it is loaded. A failed load is never tried again. */
    prepare(route: AudioRoute): Promise<SynthesizerEngine> | null {
        if (this.loaded) return null
        this.loading ??= this.load(route).then((engine) => (this.loaded = engine))
        return this.loading
    }
}

const pageEngine = new SharedEngine(async ({ context, destination }) => {
    const { loadSynthesizerEngine } = await import('./synthesizerEngine')
    return loadSynthesizerEngine(context, destination)
})

export type BrowserAudioOptions = {
    /** The page's audio by default; the tests hand in one on a fake context. */
    page?: PageAudio
    /** The page's synthesizer by default. */
    engine?: SharedEngine
    /** Makes the chips' node; the worklet's by default. */
    chips?: (route: AudioRoute) => Promise<ChipNode>
}

const createChipNode = async (route: AudioRoute): Promise<ChipNode> =>
    (await import('./chips/chipNode')).createChipNode(route)

/** How many decoded WAVs an output keeps; one played after it was pushed out is decoded again. */
const DECODED_KEPT = 32

export function createBrowserAudioOutput(options: BrowserAudioOptions = {}): AudioOutput {
    return new BrowserAudioOutput(
        options.page ?? pageAudio(),
        options.engine ?? pageEngine,
        options.chips ?? createChipNode
    )
}

type Decoded = {
    readonly bytes: Uint8Array
    /** The decoded audio; null while decoding, and for good when it would not decode. */
    buffer: AudioBuffer | null
    /** Settles once decoding is over; null once it is. */
    decoding: Promise<void> | null
}

class BrowserAudioOutput implements AudioOutput {
    /** What this output started that may still be heard, by Audio's voice number. */
    private readonly voices = new Map<number, EngineVoice>()
    /** Decoded WAVs by `SoundData.id`, the least recently used first. */
    private readonly decoded = new Map<number, Decoded>()
    private chips: ChipVoice | null = null

    constructor(
        private readonly page: PageAudio,
        private readonly engine: SharedEngine,
        private readonly makeChips: (route: AudioRoute) => Promise<ChipNode>
    ) {}

    /** Whether anything this output started may still be heard; forgets what cannot. */
    private readonly sounding = (): boolean => {
        for (const [id, voice] of this.voices) {
            if (!voice.sounding()) this.voices.delete(id)
        }
        return this.voices.size > 0
    }

    prepare(need: AudioNeed): Promise<void> | null {
        const route = this.page.open()
        if (route === null) return null
        if (need.kind === 'sound' && need.sound.kind === 'wav') {
            return this.decode(route, need.sound).decoding
        }
        //the worklet may not answer while the context is suspended for being idle
        this.page.use()
        const midi = need.kind === 'sound'
        const loading = this.engine.prepare(route)
        if (loading === null) return midi ? this.engine.loaded!.prepareMidi() : null
        return loading.then((engine) => (midi ? (engine.prepareMidi() ?? undefined) : undefined))
    }

    send(commands: readonly AudioCommand[]): void {
        const route = this.page.open()
        if (route === null) return
        let audible: boolean | undefined
        let chips: ChipCommand[] = []
        for (const command of commands) {
            switch (command.type) {
                case 'note':
                case 'sound': {
                    audible ??= this.page.use(this.sounding)
                    if (!audible) break
                    const voice =
                        command.type === 'note'
                            ? this.playNote(command)
                            : this.playSound(route, command)
                    if (voice) this.voices.set(command.voice, voice)
                    break
                }
                case 'stop':
                    this.voices.get(command.voice)?.stop(false)
                    this.voices.delete(command.voice)
                    break
                case 'stopAll':
                    for (const voice of this.voices.values()) voice.stop(true)
                    this.voices.clear()
                    chips = []
                    this.chips?.dispose()
                    this.chips = null
                    break
                default:
                    chips.push(command)
            }
        }
        if (chips.length > 0) {
            const voice = (this.chips ??= new ChipVoice(this.makeChips(route)))
            voice.send(chips)
            //unlike a Note, a chip's state is kept while the browser holds the context back
            this.page.use(voice.sounding)
        }
    }

    /** A Note is heard on time or not at all, so one sent before the synthesizer loaded is dropped. */
    private playNote(note: Extract<AudioCommand, { type: 'note' }>): EngineVoice | null {
        const engine = this.engine.loaded
        if (engine === null) return null
        return engine.playNote(note.pitch, note.instrument, note.volume, note.durationMs)
    }

    private playSound(
        route: AudioRoute,
        command: Extract<AudioCommand, { type: 'sound' }>
    ): EngineVoice {
        const { sound, loop } = command
        if (sound.kind === 'wav') {
            const decoded = this.decode(route, sound)
            const play = () => (decoded.buffer ? playBuffer(route, decoded.buffer, loop) : ENDED)
            return decoded.decoding === null ? play() : startWhenReady(decoded.decoding, play)
        }
        const info = inspectSoundFile(sound.bytes)
        const lengthMs = info.kind === 'unplayable' ? 0 : info.lengthMs
        const loading = this.engine.prepare(route)
        if (loading === null) return this.engine.loaded!.playMidi(sound.bytes, loop, lengthMs)
        return startWhenReady(loading, (engine) => engine.playMidi(sound.bytes, loop, lengthMs))
    }

    /** The decoded WAV for `sound`, decoding a copy of its bytes the first time. */
    private decode(route: AudioRoute, sound: SoundData): Decoded {
        const known = this.decoded.get(sound.id)
        if (known && known.bytes === sound.bytes) {
            this.decoded.delete(sound.id)
            this.decoded.set(sound.id, known)
            return known
        }
        const decoded: Decoded = { bytes: sound.bytes, buffer: null, decoding: null }
        decoded.decoding = route.context.decodeAudioData(sound.bytes.slice().buffer).then(
            (buffer) => {
                decoded.buffer = buffer
                decoded.decoding = null
            },
            () => {
                decoded.decoding = null
            }
        )
        this.decoded.set(sound.id, decoded)
        for (const id of this.decoded.keys()) {
            if (this.decoded.size <= DECODED_KEPT) break
            this.decoded.delete(id)
        }
        return decoded
    }
}

/**
 * An output's chips: the commands sent before the node runs, then the node. A node that will not
 * load plays nothing, and the program never notices.
 */
class ChipVoice {
    private node: ChipNode | null = null
    private pending: ChipCommand[] | null = []
    private audible = false
    private disposed = false

    constructor(node: Promise<ChipNode>) {
        node.then(
            (node) => {
                if (this.disposed) return node.dispose()
                this.node = node
                node.onReport = (report) => (this.audible = report.audible)
                node.post({ type: 'commands', commands: this.pending ?? [] })
                this.pending = null
            },
            () => this.dispose()
        )
    }

    send(commands: ChipCommand[]): void {
        if (this.disposed) return
        if (this.pending === null) this.node?.post({ type: 'commands', commands })
        else for (const command of commands) this.pending.push(command)
    }

    /** Whether the chips may be heard: while loading, and while the worklet says so. */
    readonly sounding = (): boolean => !this.disposed && (this.pending !== null || this.audible)

    dispose(): void {
        this.disposed = true
        this.pending = null
        this.node?.dispose()
        this.node = null
    }
}

const ENDED: EngineVoice = { sounding: () => false, stop: () => {} }

function playBuffer(route: AudioRoute, buffer: AudioBuffer, loop: boolean): EngineVoice {
    const source = route.context.createBufferSource()
    source.buffer = buffer
    source.loop = loop
    source.connect(route.destination)
    let ended = false
    source.onended = () => {
        ended = true
        source.disconnect()
    }
    source.start()
    return {
        sounding: () => !ended,
        stop() {
            if (ended) return
            ended = true
            source.onended = null
            source.stop()
            source.disconnect()
        }
    }
}

/**
 * A voice that starts once `ready` settles, unless it was stopped first: a WAV pushed out of the
 * decoded ones, or a MIDI Sound sent while the synthesizer was still loading.
 */
function startWhenReady<T>(ready: Promise<T>, start: (value: T) => EngineVoice): EngineVoice {
    let voice: EngineVoice | null = null
    let settled = false
    let stopped = false
    ready.then(
        (value) => {
            settled = true
            if (!stopped) voice = start(value)
        },
        () => (settled = true)
    )
    return {
        sounding: () => !stopped && (!settled || (voice?.sounding() ?? false)),
        stop(cut) {
            stopped = true
            voice?.stop(cut)
        }
    }
}
