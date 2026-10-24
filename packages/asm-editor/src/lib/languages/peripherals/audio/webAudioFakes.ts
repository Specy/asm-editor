import type { EngineVoice, SynthesizerEngine } from './synthesizerEngine'

/**
 * Stand-ins for the parts of Web Audio and of the synthesizer that the browser output uses, for its
 * tests and those of the page's context under node.
 */

export class FakeParam {
    value = 1
    readonly targets: number[] = []

    setTargetAtTime(value: number): void {
        this.targets.push(value)
        this.value = value
    }

    cancelScheduledValues(): void {}
}

export class FakeNode {
    readonly connections: unknown[] = []

    connect(node: unknown): void {
        this.connections.push(node)
    }

    disconnect(): void {
        this.connections.length = 0
    }
}

export class FakeGain extends FakeNode {
    readonly gain = new FakeParam()
}

export class FakeBufferSource extends FakeNode {
    buffer: unknown = null
    loop = false
    started = false
    stopped = false
    onended: (() => void) | null = null

    start(): void {
        this.started = true
    }

    stop(): void {
        this.stopped = true
    }

    /** Plays to the end, as a one-shot does. */
    end(): void {
        this.onended?.()
    }
}

export class FakeAudioContext {
    state: AudioContextState
    currentTime = 0
    readonly destination = new FakeNode()
    readonly gains: FakeGain[] = []
    readonly sources: FakeBufferSource[] = []
    readonly decodes: ArrayBuffer[] = []
    resumes = 0
    suspends = 0
    /** Whether `decodeAudioData` rejects, as it does for data it cannot read. */
    undecodable = false

    constructor(state: AudioContextState = 'running') {
        this.state = state
    }

    createGain(): FakeGain {
        const gain = new FakeGain()
        this.gains.push(gain)
        return gain
    }

    createBufferSource(): FakeBufferSource {
        const source = new FakeBufferSource()
        this.sources.push(source)
        return source
    }

    decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer> {
        this.decodes.push(data)
        if (this.undecodable) return Promise.reject(new Error('Unable to decode audio data'))
        return Promise.resolve({ duration: 0.5 } as AudioBuffer)
    }

    resume(): Promise<void> {
        this.resumes++
        this.state = 'running'
        return Promise.resolve()
    }

    suspend(): Promise<void> {
        this.suspends++
        this.state = 'suspended'
        return Promise.resolve()
    }

    get asContext(): AudioContext {
        return this as unknown as AudioContext
    }
}

export class FakeVoice implements EngineVoice {
    stoppedWith: boolean | null = null
    ended = false

    constructor(readonly what: string) {}

    sounding(): boolean {
        return this.stoppedWith === null && !this.ended
    }

    stop(cut: boolean): void {
        this.stoppedWith = cut
    }
}

export class FakeEngine implements SynthesizerEngine {
    readonly voices: FakeVoice[] = []
    midiReady: Promise<void> | null = null

    playNote(pitch: number, instrument: number, volume: number, durationMs: number): FakeVoice {
        return this.add(`note ${pitch} ${instrument} ${volume} ${durationMs}`)
    }

    prepareMidi(): Promise<void> | null {
        return this.midiReady
    }

    playMidi(_bytes: Uint8Array, loop: boolean, lengthMs: number): FakeVoice {
        return this.add(`midi ${loop ? 'loop' : lengthMs}`)
    }

    private add(what: string): FakeVoice {
        const voice = new FakeVoice(what)
        this.voices.push(voice)
        return voice
    }
}
