import type { AudioRoute } from '../audioContext'
import { CHIP_PROCESSOR, type ChipMessage, type ChipReport } from './chipMessages'
import processorUrl from './chipProcessor.ts?worker&url'

/**
 * Makes the node an output plays its chips on. The worklet module is Vite's `?worker&url` bundle of
 * `chipProcessor.ts`, added once per context; this module is imported only when a program first
 * writes a chip, so a page that never does fetches nothing.
 */

/** One output's chips, as the output sees them. */
export type ChipNode = {
    post(message: ChipMessage): void
    /** Called with what the worklet reports, set by the owner. */
    onReport: ((report: ChipReport) => void) | null
    /** Stops it for good and disconnects it. */
    dispose(): void
}

const modules = new WeakMap<BaseAudioContext, Promise<void>>()

export async function createChipNode(route: AudioRoute): Promise<ChipNode> {
    const { context, destination } = route
    let loading = modules.get(context)
    if (loading === undefined) {
        loading = context.audioWorklet.addModule(processorUrl)
        modules.set(context, loading)
    }
    await loading
    const node = new AudioWorkletNode(context, CHIP_PROCESSOR, {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1]
    })
    node.connect(destination)
    const chip: ChipNode = {
        onReport: null,
        post: (message) => node.port.postMessage(message),
        dispose() {
            node.port.postMessage({ type: 'dispose' } satisfies ChipMessage)
            node.port.onmessage = null
            node.disconnect()
        }
    }
    node.port.onmessage = (event: MessageEvent<ChipReport>) => chip.onReport?.(event.data)
    return chip
}
