import { beforeAll, describe, expect, it } from 'vite-plus/test'
import type { ChipCommand } from '../AudioOutput'
import type { ChipMessage, ChipReport } from './chipMessages'

/**
 * The worklet under node: `chipProcessor.ts` registers its processor in the AudioWorklet's global
 * scope, which these stand-ins provide, so its message handling, rendering and reports run as they
 * do in the browser.
 */

class FakePort {
    readonly posted: ChipReport[] = []
    onmessage: ((event: { data: ChipMessage }) => void) | null = null

    postMessage(report: ChipReport): void {
        this.posted.push(report)
    }
}

type Processor = {
    readonly port: FakePort
    process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean
}

let Processor: new () => Processor

beforeAll(async () => {
    const scope = globalThis as Record<string, unknown>
    scope.sampleRate = 48_000
    scope.AudioWorkletProcessor = class {
        readonly port = new FakePort()
    }
    scope.registerProcessor = (_name: string, processor: new () => Processor) => {
        Processor = processor
    }
    await import('./chipProcessor')
})

function post(processor: Processor, commands: ChipCommand[]): void {
    processor.port.onmessage?.({ data: { type: 'commands', commands } })
}

/** Renders `quanta` render quanta and answers the last, and whether the node goes on. */
function render(processor: Processor, quanta = 1): { out: Float32Array; alive: boolean } {
    let out = new Float32Array(128)
    let alive = true
    for (let i = 0; i < quanta; i++) {
        out = new Float32Array(128)
        alive = processor.process([], [[out]])
    }
    return { out, alive }
}

const peak = (out: Float32Array) => out.reduce((top, value) => Math.max(top, Math.abs(value)), 0)

/** Channel 0 on a sine at 440 Hz, gate on, at the volume given. */
const SINE = (volume: number): ChipCommand => ({
    type: 'synth',
    writes: [0x11, 3, 0x00, 440, 0x12, volume, 0x13, 127, 0x10, 1]
})

describe('the chip worklet', () => {
    it('renders silence until it is told something, then the chips', () => {
        const processor = new Processor()
        expect(peak(render(processor).out)).toBe(0)
        post(processor, [SINE(100)])
        expect(peak(render(processor, 4).out)).toBeGreaterThan(0.1)
        expect(processor.port.posted).toEqual([{ type: 'audible', audible: true }])
    })

    it('reports a gated channel at volume 0 as not heard', () => {
        const processor = new Processor()
        post(processor, [SINE(0)])
        render(processor, 4)
        expect(processor.port.posted).toEqual([])
        post(processor, [{ type: 'synth', writes: [0x12, 100] }])
        expect(processor.port.posted).toEqual([{ type: 'audible', audible: true }])
    })

    it('reports the chips silent once released', () => {
        const processor = new Processor()
        post(processor, [SINE(100), { type: 'soundChip', writes: [0, 254, 7, 0x3e, 8, 15] }])
        render(processor, 2)
        post(processor, [{ type: 'releaseChips' }])
        render(processor, 2)
        expect(processor.port.posted.at(-1)).toEqual({ type: 'audible', audible: false })
    })

    it('mixes the Synth and the Sound chip', () => {
        const synth = new Processor()
        post(synth, [SINE(100)])
        const both = new Processor()
        post(both, [SINE(100), { type: 'soundChip', writes: [0, 254, 7, 0x3e, 8, 15] }])
        const alone = render(synth, 8).out
        const mixed = render(both, 8).out
        expect(mixed.some((value, i) => Math.abs(value - alone[i]) > 0.01)).toBe(true)
    })

    it('plays the rest of a batch past a command it cannot take', () => {
        const processor = new Processor()
        const broken = { type: 'synthUpload', offset: 0, bytes: null } as unknown as ChipCommand
        post(processor, [broken, SINE(100)])
        expect(peak(render(processor, 4).out)).toBeGreaterThan(0.1)
    })

    it('ends once disposed of', () => {
        const processor = new Processor()
        post(processor, [SINE(100)])
        processor.port.onmessage?.({ data: { type: 'dispose' } })
        expect(render(processor).alive).toBe(false)
    })
})
