import type { ChipCommand, TimelineCommand } from './AudioOutput'
import type { AudioRoute } from './audioContext'
import { MIDI_PUMP_MS, MidiPortScheduler } from './midiPort'
import type { PcmCommand } from './pcm/pcmMessages'
import type { PcmNode } from './pcm/pcmNode'
import { ProgramTimeline } from './programTimeline'
import type { MidiPorts } from './synthesizerEngine'

/**
 * Where x86's sound timeline becomes sound in a browser
 * ([x86-devices-plan.md](../../../../../../../docs/design/x86-devices-plan.md), M8): one per output,
 * made on the first timeline command, so a silent program loads nothing. Every device maps Program
 * time through one `ProgramTimeline`, a fixed latency behind on the context's clock.
 *
 * - **`/dev/dsp`** plays on a PCM worklet node of the output's own (`pcm/pcmCore.ts`), made on the
 *   first samples, with the mixer's gain the program last set.
 * - **The raw MIDI port** plays on a synthesizer the page's pool lends for the run
 *   (`synthesizerEngine.ts`), through a `MidiPortScheduler` that hands it each message just before
 *   it is due; messages that come before the pool has loaded wait in it.
 * - **The PC speaker** is a voice of the chips' worklet: its tones become `speaker` commands for the
 *   output's chip node.
 * - **Stop, Build and dispose** (`stopAll`) drop the samples at once, give the MIDI synthesizer back
 *   silenced, and forget the mapping; the chip node goes with the output's other chips.
 * - While the browser holds the context back, samples and note-ons are dropped rather than heard
 *   late, all at once, as Notes are; a channel's settings and the speaker's tone, which are state,
 *   still go through.
 */

/** The page's pool of MIDI port synthesizers, loaded on the first need for it. */
export type SharedMidiPorts = {
    /** The promise of the pool, or null once it is loaded. */
    prepare(route: AudioRoute): Promise<MidiPorts> | null
    readonly loaded: MidiPorts | null
}

export class X86Output {
    private readonly timeline = new ProgramTimeline()
    private pcm: PcmVoice | null = null
    /** The commands for the PCM node from the batch being read, and the buffers they hand over. */
    private pcmBatch: PcmCommand[] = []
    private pcmTransfer: Transferable[] = []
    /** The mixer's gain the program last set, which a new PCM node starts from. */
    private gain = { left: 1, right: 1 }
    private midi: MidiPortScheduler | null = null
    /** Until the run's MIDI synthesizer has its bank: the promise of it. */
    private midiReady: Promise<void> | null = null
    private pumpTimer: ReturnType<typeof setInterval> | null = null
    /** Output time of the last tone sent, before which the program's end does not silence it. */
    private lastTone: number | null = null

    constructor(
        private readonly ports: SharedMidiPorts,
        private readonly makePcm: (route: AudioRoute) => Promise<PcmNode>
    ) {}

    /** Whether anything may still be heard, which keeps the page's context awake. */
    readonly sounding = (): boolean =>
        (this.pcm?.sounding() ?? false) || (this.midi?.sounding() ?? false)

    /**
     * Takes one command of a batch, in order: `audible` says whether the context runs, and what the
     * PC speaker is told goes into `chips`, for the output's chip node. `flush()` ends the batch.
     */
    take(
        route: AudioRoute,
        command: TimelineCommand,
        audible: boolean,
        chips: ChipCommand[]
    ): void {
        const at = (programMs: number) => this.timeline.toOutput(programMs)
        switch (command.type) {
            case 'programTime':
                this.timeline.observe(command.now, route.context.currentTime)
                break
            case 'pcm':
                if (!audible) break
                this.pcm ??= this.createPcm(route)
                this.pcmBatch.push({
                    type: 'chunk',
                    start: at(command.start),
                    rate: command.rate,
                    frames: command.frames
                })
                this.pcmTransfer.push(command.frames.buffer)
                break
            case 'pcmGain':
                this.gain = { left: command.left, right: command.right }
                if (this.pcm) this.pcmBatch.push({ type: 'gain', at: at(command.at), ...this.gain })
                break
            case 'midi': {
                const message = command.message
                if (!audible && (message[0] & 0xf0) === 0x90 && (message[2] ?? 0) > 0) break
                this.port(route).send(command.at, message)
                break
            }
            case 'tone':
                this.lastTone = at(command.at)
                chips.push({ type: 'speaker', at: this.lastTone, hz: command.hz })
                break
            case 'cut': {
                const device = command.device
                if (device === undefined || device === 'dsp') {
                    if (this.pcm) this.pcmBatch.push({ type: 'cut', after: at(command.after) })
                }
                if (device === undefined || device === 'midi') this.midi?.cut(command.after)
                if ((device === undefined || device === 'speaker') && this.lastTone !== null) {
                    chips.push({ type: 'speakerCut', after: at(command.after) })
                }
                break
            }
            case 'programEnd':
                if (this.lastTone !== null) {
                    const end = Math.max(at(command.at), this.lastTone)
                    chips.push({ type: 'speaker', at: end, hz: 0 })
                }
                this.midi?.end(command.at)
                break
        }
    }

    /** Ends a batch: the PCM node gets its commands in one message, the MIDI port what is due. */
    flush(): void {
        if (this.pcmBatch.length > 0) {
            //each chunk is a copy of its own, but a buffer listed twice would fail the whole post
            this.pcm?.post(this.pcmBatch, [...new Set(this.pcmTransfer)])
            this.pcmBatch = []
            this.pcmTransfer = []
        }
        this.midi?.pump()
        if (this.midi?.pending) this.keepPumping()
    }

    /**
     * Readies the run's MIDI port for a program holding until it can be heard: the promise of its
     * synthesizer's bank, or null once it is in. It rejects when the pool cannot load.
     */
    prepareMidi(route: AudioRoute): Promise<void> | null {
        this.port(route)
        return this.midiReady
    }

    /** Stop, Build and dispose: everything still to play is dropped, at once. */
    stopAll(): void {
        this.pcm?.dispose()
        this.pcm = null
        this.pcmBatch = []
        this.pcmTransfer = []
        this.gain = { left: 1, right: 1 }
        this.midi?.stop()
        this.midi = null
        this.midiReady = null
        if (this.pumpTimer !== null) clearInterval(this.pumpTimer)
        this.pumpTimer = null
        this.lastTone = null
        this.timeline.reset()
    }

    private createPcm(route: AudioRoute): PcmVoice {
        const voice = new PcmVoice(this.makePcm(route))
        this.pcmBatch.push({ type: 'gain', at: -Infinity, ...this.gain })
        return voice
    }

    /** The run's MIDI port, asking the page's pool for a synthesizer the first time. */
    private port(route: AudioRoute): MidiPortScheduler {
        if (this.midi) return this.midi
        const scheduler = new MidiPortScheduler(this.timeline, () => route.context.currentTime)
        this.midi = scheduler
        const loading = this.ports.prepare(route)
        let ready: Promise<void> | null
        if (loading === null) {
            const port = this.ports.loaded!.take()
            scheduler.attach(port)
            ready = port.whenReady()
        } else {
            ready = loading.then((ports) => {
                if (this.midi !== scheduler) return
                const port = ports.take()
                scheduler.attach(port)
                this.keepPumping()
                return port.whenReady() ?? undefined
            })
        }
        if (ready === null) return scheduler
        this.midiReady = ready
        ready.then(
            () => {
                if (this.midiReady === ready) this.midiReady = null
            },
            //a synthesizer that cannot load plays nothing; Audio's prepare puts the reason in the Log
            () => {
                if (this.midi === scheduler) scheduler.stop()
            }
        )
        return scheduler
    }

    /** Hands the MIDI port's waiting messages over while the main thread is free, until none waits. */
    private keepPumping(): void {
        if (this.pumpTimer !== null || !this.midi?.pending) return
        this.pumpTimer = setInterval(() => {
            this.midi?.pump()
            if (this.midi?.pending) return
            if (this.pumpTimer !== null) clearInterval(this.pumpTimer)
            this.pumpTimer = null
        }, MIDI_PUMP_MS)
    }
}

/**
 * An output's `/dev/dsp`: the commands posted before the node runs, then the node. A node that will
 * not load plays nothing, and the program never notices.
 */
class PcmVoice {
    private node: PcmNode | null = null
    private pending: { commands: PcmCommand[]; transfer: Transferable[] }[] | null = []
    private busy = false
    private disposed = false

    constructor(node: Promise<PcmNode>) {
        node.then(
            (node) => {
                if (this.disposed) return node.dispose()
                this.node = node
                node.onReport = (report) => (this.busy = report.busy)
                for (const { commands, transfer } of this.pending ?? []) {
                    node.post({ type: 'commands', commands }, transfer)
                }
                this.pending = null
            },
            () => this.dispose()
        )
    }

    post(commands: PcmCommand[], transfer: Transferable[]): void {
        if (this.disposed) return
        if (this.pending === null) this.node?.post({ type: 'commands', commands }, transfer)
        else this.pending.push({ commands, transfer })
    }

    /** Whether it may be heard: while loading, and while the worklet has samples queued. */
    readonly sounding = (): boolean => !this.disposed && (this.pending !== null || this.busy)

    dispose(): void {
        this.disposed = true
        this.pending = null
        this.node?.dispose()
        this.node = null
    }
}
