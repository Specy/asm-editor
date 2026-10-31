import type { AudioRoute } from '../audioContext'
import { PCM_PROCESSOR, type PcmMessage, type PcmReport } from './pcmMessages'
import processorUrl from './pcmProcessor.ts?worker&url'

/**
 * Makes the node an output plays x86's `/dev/dsp` on. The worklet module is Vite's `?worker&url`
 * bundle of `pcmProcessor.ts`, added once per context; this module is imported only when a program
 * first plays samples, so a page that never does fetches nothing.
 */

/** One output's `/dev/dsp`, as the output sees it. */
export type PcmNode = {
    /** Posts `message`, handing over the buffers in `transfer`. */
    post(message: PcmMessage, transfer?: Transferable[]): void
    /** Called with what the worklet reports, set by the owner. */
    onReport: ((report: PcmReport) => void) | null
    /** Stops it for good and disconnects it. */
    dispose(): void
}

const modules = new WeakMap<BaseAudioContext, Promise<void>>()

export async function createPcmNode(route: AudioRoute): Promise<PcmNode> {
    const { context, destination } = route
    let loading = modules.get(context)
    if (loading === undefined) {
        loading = context.audioWorklet.addModule(processorUrl)
        modules.set(context, loading)
    }
    await loading
    const node = new AudioWorkletNode(context, PCM_PROCESSOR, {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2]
    })
    node.connect(destination)
    const pcm: PcmNode = {
        onReport: null,
        post: (message, transfer = []) => node.port.postMessage(message, transfer),
        dispose() {
            node.port.postMessage({ type: 'dispose' } satisfies PcmMessage)
            node.port.onmessage = null
            node.disconnect()
        }
    }
    node.port.onmessage = (event: MessageEvent<PcmReport>) => pcm.onReport?.(event.data)
    return pcm
}
