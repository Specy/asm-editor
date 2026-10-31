import { beforeAll, describe, expect, it } from 'vite-plus/test'
import type { PcmCommand, PcmMessage, PcmReport } from './pcmMessages'

/**
 * The worklet under node: `pcmProcessor.ts` registers its processor in the AudioWorklet's global
 * scope, which these stand-ins provide, the clock included, so its message handling, rendering and
 * reports run as they do in the browser.
 */

class FakePort {
    readonly posted: PcmReport[] = []
    onmessage: ((event: { data: PcmMessage }) => void) | null = null

    postMessage(report: PcmReport): void {
        this.posted.push(report)
    }
}

type Processor = {
    readonly port: FakePort
    process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean
}

let Processor: new () => Processor
const scope = globalThis as Record<string, unknown>

beforeAll(async () => {
    scope.sampleRate = 48_000
    scope.currentTime = 0
    scope.AudioWorkletProcessor = class {
        readonly port = new FakePort()
    }
    scope.registerProcessor = (_name: string, processor: new () => Processor) => {
        Processor = processor
    }
    await import('./pcmProcessor')
})

function post(processor: Processor, commands: PcmCommand[]): void {
    processor.port.onmessage?.({ data: { type: 'commands', commands } })
}

/** Renders a quantum at `time`, answering both sides and whether the node goes on. */
function render(processor: Processor, time: number) {
    scope.currentTime = time
    const left = new Float32Array(128)
    const right = new Float32Array(128)
    const alive = processor.process([], [[left, right]])
    return { left, right, alive }
}

const chunk = (start: number, value: number, count = 4800): PcmCommand => ({
    type: 'chunk',
    start,
    rate: 48_000,
    frames: new Float32Array(count * 2).fill(value)
})

describe('the PCM worklet', () => {
    it('plays a chunk at its time on the context clock, and reports while it has sound', () => {
        const processor = new Processor()
        post(processor, [chunk(1, 0.5)])
        expect(processor.port.posted).toEqual([{ type: 'busy', busy: true }])
        expect(render(processor, 0.5).left.every((value) => value === 0)).toBe(true)
        const playing = render(processor, 1)
        expect(playing.left[0]).toBeCloseTo(0.5)
        expect(playing.right[0]).toBeCloseTo(0.5)
        render(processor, 1.2)
        expect(processor.port.posted.at(-1)).toEqual({ type: 'busy', busy: false })
    })

    it('applies the gain and the cut it is sent', () => {
        const processor = new Processor()
        post(processor, [
            { type: 'gain', at: -Infinity, left: 0.5, right: 0 },
            chunk(0, 1),
            chunk(0.1, 1),
            { type: 'cut', after: 0.1 }
        ])
        const { left, right } = render(processor, 0.05)
        expect(left[0]).toBeCloseTo(0.5)
        expect(right[0]).toBe(0)
        expect(render(processor, 0.12).left.every((value) => value === 0)).toBe(true)
    })

    it('plays the rest of a batch past a command it cannot take', () => {
        const processor = new Processor()
        const broken = {
            type: 'chunk',
            start: 0,
            rate: 8000,
            frames: null
        } as unknown as PcmCommand
        post(processor, [broken, chunk(0, 0.5)])
        expect(render(processor, 0).right[0]).toBeCloseTo(0.5)
    })

    it('ends once disposed of', () => {
        const processor = new Processor()
        post(processor, [chunk(0, 0.5)])
        processor.port.onmessage?.({ data: { type: 'dispose' } })
        expect(render(processor, 0).alive).toBe(false)
    })
})
