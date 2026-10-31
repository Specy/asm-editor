import { PCM_PROCESSOR, type PcmCommand, type PcmMessage, type PcmReport } from './pcmMessages'
import { PcmCore } from './pcmCore'

/**
 * The AudioWorklet that plays x86's `/dev/dsp`, from the chunks its output posts
 * ([x86-devices-plan.md](../../../../../../../../docs/design/x86-devices-plan.md), decision 17). The
 * app bundles it on its own with Vite's `?worker&url`, as it does the chips' worklet, so it must import
 * nothing that touches the page. The node renders until the output disposes of it.
 */

declare const sampleRate: number
declare const currentTime: number
declare class AudioWorkletProcessor {
    readonly port: MessagePort
}
declare function registerProcessor(
    name: string,
    processor: new () => AudioWorkletProcessor & {
        process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean
    }
): void

class PcmProcessor extends AudioWorkletProcessor {
    private readonly core = new PcmCore(sampleRate)
    private alive = true
    private busy = false

    constructor() {
        super()
        this.port.onmessage = (event: MessageEvent<PcmMessage>) => {
            const message = event.data
            if (message.type === 'dispose') this.alive = false
            else
                for (const command of message.commands) {
                    //one command it cannot take leaves the others of the batch to play
                    try {
                        this.apply(command)
                    } catch (error) {
                        console.error(error)
                    }
                }
            this.report()
        }
    }

    private apply(command: PcmCommand): void {
        switch (command.type) {
            case 'chunk':
                this.core.add(command.start, command.rate, command.frames)
                break
            case 'cut':
                this.core.cut(command.after)
                break
            case 'gain':
                this.core.setGain(command.at, command.left, command.right)
                break
        }
    }

    private report(): void {
        const busy = this.core.busy
        if (busy === this.busy) return
        this.busy = busy
        this.port.postMessage({ type: 'busy', busy } satisfies PcmReport)
    }

    process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
        const out = outputs[0]
        if (!this.alive || !out?.[0]) return this.alive
        //with nothing queued the output stays as the engine handed it over, silent
        if (!this.core.busy) return true
        this.core.render(out[0], out[1] ?? out[0], currentTime)
        this.report()
        return true
    }
}

registerProcessor(PCM_PROCESSOR, PcmProcessor)
