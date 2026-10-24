import type { ChipCommand } from '../AudioOutput'
import { CHIP_PROCESSOR, type ChipMessage, type ChipReport } from './chipMessages'
import { SoundChipCore } from './soundChipCore'
import { SynthCore } from './synthCore'

/**
 * The AudioWorklet that plays an Emulator's chips, the **Synth** and the **Sound chip**, from the
 * commands its output posts ([the plan](../../../../../../../../docs/design/waveform-sound-plan.md),
 * decision 5). The app bundles it on its own with Vite's `?worker&url`, so it must import nothing
 * that touches the page. Each chip is made on its first command; the node renders until the output
 * disposes of it.
 */

declare const sampleRate: number
declare class AudioWorkletProcessor {
    readonly port: MessagePort
}
declare function registerProcessor(
    name: string,
    processor: new () => AudioWorkletProcessor & {
        process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean
    }
): void

/** Frames rendered after the chips go still, so the DC filters settle before rendering stops. */
const TAIL_FRAMES = 4096

class ChipProcessor extends AudioWorkletProcessor {
    private synth: SynthCore | null = null
    private soundChip: SoundChipCore | null = null
    private scratch = new Float32Array(128)
    private alive = true
    private audible = false
    private quietFrames = TAIL_FRAMES

    constructor() {
        super()
        this.port.onmessage = (event: MessageEvent<ChipMessage>) => {
            const message = event.data
            if (message.type === 'dispose') this.alive = false
            else
                for (const command of message.commands) {
                    //one command the chip cannot take leaves the others of the batch to play
                    try {
                        this.apply(command)
                    } catch (error) {
                        console.error(error)
                    }
                }
            this.report()
        }
    }

    private apply(command: ChipCommand): void {
        switch (command.type) {
            case 'synth': {
                const synth = (this.synth ??= new SynthCore(sampleRate))
                for (let i = 0; i < command.writes.length; i += 2) {
                    synth.write(command.writes[i], command.writes[i + 1])
                }
                break
            }
            case 'synthUpload':
                ;(this.synth ??= new SynthCore(sampleRate)).upload(command.offset, command.bytes)
                break
            case 'soundChip': {
                const chip = (this.soundChip ??= new SoundChipCore(sampleRate))
                for (let i = 0; i < command.writes.length; i += 2) {
                    chip.write(command.writes[i], command.writes[i + 1])
                }
                break
            }
            case 'soundChipLoad':
                ;(this.soundChip ??= new SoundChipCore(sampleRate)).load(command.registers)
                break
            case 'releaseChips':
                this.synth?.releaseAll()
                this.soundChip?.releaseAll()
                break
        }
        this.quietFrames = 0
    }

    private report(): void {
        const audible = (this.synth?.audible ?? false) || (this.soundChip?.audible ?? false)
        if (audible === this.audible) return
        this.audible = audible
        this.port.postMessage({ type: 'audible', audible } satisfies ChipReport)
    }

    process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
        const out = outputs[0]?.[0]
        if (!this.alive || !out) return this.alive
        if (this.quietFrames >= TAIL_FRAMES) return true
        if (this.synth) this.synth.render(out)
        if (this.soundChip) {
            if (this.synth === null) {
                this.soundChip.render(out)
            } else {
                if (this.scratch.length !== out.length) this.scratch = new Float32Array(out.length)
                this.soundChip.render(this.scratch)
                for (let i = 0; i < out.length; i++) out[i] += this.scratch[i]
            }
        }
        this.report()
        //rendering goes on while an envelope moves, heard or not, and for a tail after that
        const active = (this.synth?.active ?? false) || (this.soundChip?.active ?? false)
        this.quietFrames = active ? 0 : this.quietFrames + out.length
        return true
    }
}

registerProcessor(CHIP_PROCESSOR, ChipProcessor)
