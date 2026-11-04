import { describe, expect, it } from 'vite-plus/test'
import {
    PCM_BASE,
    PCM_CONTROL,
    PCM_DATA,
    PCM_FIFO_FRAMES,
    PCM_FREE,
    PCM_ON_BIT,
    PCM_RATE,
    PCM_STEREO_BIT
} from '#lib/languages/sampledAudioRegisters.ts'
import { SampledAudioDevice } from './SampledAudioDevice'
import { soundRig } from './soundDeviceFakes'

const CONTROL = PCM_BASE + PCM_CONTROL
const RATE = PCM_BASE + PCM_RATE
const FREE = PCM_BASE + PCM_FREE
const DATA = PCM_BASE + PCM_DATA

function setup(options: { virtual?: boolean; silent?: boolean; history?: number } = {}) {
    const rig = soundRig(options)
    const output = new SampledAudioDevice(rig.host)
    output.connect(rig.bus)
    output.track(rig.position, options.history ?? 100_000)
    /** One instruction storing `length` bytes, as `sw`, `sh` or `sb` does. */
    const store = (address: number, value: number, length = 4) => {
        rig.instruction()
        rig.store(address, value, length, (a, l, v) => output.stored(a, l, v, true))
    }
    const start = (control = PCM_ON_BIT, rate?: number) => {
        if (rate !== undefined) store(RATE, rate)
        store(CONTROL, control)
    }
    /** Two mono samples in one word, the first in the low half. */
    const mono = (first: number, second: number) => (first & 0xffff) | (second << 16)
    /** The program reading Free, as `lw` does: the value memory held, then the observer. */
    const readFree = () => {
        const value = rig.word(FREE)
        output.freeRead()
        return value
    }
    /** What the output was handed, flushed as at the end of a run call. */
    const chunks = () => {
        output.flush()
        return rig.pcm()
    }
    return { ...rig, output, store, start, mono, readFree, chunks }
}

describe('the registers', () => {
    it('start off, in mono, at 8,000 frames a second, with the whole FIFO free', () => {
        const { word } = setup()
        expect(word(CONTROL)).toBe(0)
        expect(word(RATE)).toBe(8000)
        expect(word(FREE)).toBe(PCM_FIFO_FRAMES)
        expect(word(DATA)).toBe(0)
    })

    it('clamp the rate to 4,000 to 48,000 and read back the rate used', () => {
        const { store, word } = setup()
        store(RATE, 1000)
        expect(word(RATE)).toBe(4000)
        store(RATE, 100_000)
        expect(word(RATE)).toBe(48_000)
        store(RATE, -1)
        expect(word(RATE)).toBe(48_000)
        store(RATE, 22_050)
        expect(word(RATE)).toBe(22_050)
        //a halfword store changes the low half of what the register holds
        store(RATE, 16_000, 2)
        expect(word(RATE)).toBe(16_000)
    })

    it('read Control back as its two bits', () => {
        const { store, word } = setup()
        store(CONTROL, 0xff)
        expect(word(CONTROL)).toBe(PCM_ON_BIT | PCM_STEREO_BIT)
        store(CONTROL, PCM_ON_BIT, 1)
        expect(word(CONTROL)).toBe(PCM_ON_BIT)
    })
})

describe('writing samples', () => {
    it('packs two mono samples into a word, the low half first, as frames heard on both sides', () => {
        const { start, store, mono, chunks } = setup()
        start(PCM_ON_BIT, 16_000)
        store(DATA, mono(-32768, 16384))
        const [chunk] = chunks()
        expect(chunk).toMatchObject({ type: 'pcm', start: 0, rate: 16_000 })
        expect([...chunk.frames]).toEqual([-1, -1, 0.5, 0.5])
    })

    it('packs one stereo frame into a word, left in the low half', () => {
        const { start, store, mono, chunks } = setup()
        start(PCM_ON_BIT | PCM_STEREO_BIT)
        store(DATA, mono(8192, -8192))
        expect([...chunks()[0].frames]).toEqual([0.25, -0.25])
    })

    it('goes out as one chunk of consecutive frames, starting where the FIFO had got to', () => {
        const { start, store, mono, chunks, at, word } = setup()
        start(PCM_ON_BIT, 8000)
        at(100)
        for (let i = 0; i < 400; i++) store(DATA, mono(i, i))
        const [chunk] = chunks()
        expect(chunk.start).toBe(100)
        expect(chunk.frames.length).toBe(800 * 2)
        //the next words follow on, 800 frames, a tenth of a second, later
        store(DATA, mono(1, 1))
        expect(chunks()[1].start).toBeCloseTo(200, 9)
        expect(word(FREE)).toBe(PCM_FIFO_FRAMES - 802)
    })

    it('drops a word written while it is off, noting it once', () => {
        const { store, mono, chunks, notes, output } = setup()
        store(DATA, mono(1, 1))
        store(DATA, mono(1, 1))
        expect(output.queued).toBe(0)
        expect(chunks()).toEqual([])
        expect(notes).toEqual([expect.stringContaining('the sampled-audio output was off')])
    })

    it('takes samples only as whole words', () => {
        const { start, store, notes, output } = setup()
        start()
        store(DATA, 0x1234, 2)
        expect(output.queued).toBe(0)
        expect(notes).toEqual([expect.stringContaining('takes whole words')])
    })
})

describe('Free and the FIFO', () => {
    it('drains at its rate in Program time', () => {
        const { start, store, mono, readFree, at } = setup()
        start(PCM_ON_BIT, 8000)
        for (let i = 0; i < 100; i++) store(DATA, mono(0, 0))
        expect(readFree()).toBe(PCM_FIFO_FRAMES - 200)
        at(10)
        //80 frames have played; the read after this one sees them
        readFree()
        expect(readFree()).toBe(PCM_FIFO_FRAMES - 120)
        at(1000)
        readFree()
        expect(readFree()).toBe(PCM_FIFO_FRAMES)
    })

    it('counts whole words in mono, so Free is always even there', () => {
        const { start, store, mono, readFree, at } = setup()
        start(PCM_ON_BIT, 8000)
        store(DATA, mono(0, 0))
        at(0.125)
        readFree()
        //one frame played, so 8,191 frames are free, and that is 4,095 words
        expect(readFree()).toBe(PCM_FIFO_FRAMES - 2)
    })

    it('drops a word written when it does not fit, which Free warned of, noting it', () => {
        const { start, store, mono, readFree, output, notes, chunks } = setup()
        start()
        for (let i = 0; i < PCM_FIFO_FRAMES / 2; i++) store(DATA, mono(0, 0))
        expect(readFree()).toBe(0)
        store(DATA, mono(1, 1))
        expect(output.queued).toBe(PCM_FIFO_FRAMES)
        expect(notes).toEqual([expect.stringContaining('FIFO was full')])
        const frames = chunks().reduce((sum, chunk) => sum + chunk.frames.length / 2, 0)
        expect(frames).toBe(PCM_FIFO_FRAMES)
    })

    it('starts a new stream at the moment a word reaches an empty FIFO', () => {
        const { start, store, mono, chunks, at } = setup()
        start(PCM_ON_BIT, 8000)
        store(DATA, mono(0, 0))
        at(50)
        store(DATA, mono(0, 0))
        expect(chunks().map((chunk) => chunk.start)).toEqual([0, 50])
    })

    it('empties when turned off, and when the rate or stereo changes with frames queued', () => {
        const { start, store, mono, output, cuts, at } = setup()
        start(PCM_ON_BIT, 8000)
        store(DATA, mono(0, 0))
        at(0.1)
        store(CONTROL, 0)
        expect(output.queued).toBe(0)
        start(PCM_ON_BIT)
        store(DATA, mono(0, 0))
        at(0.2)
        store(RATE, 16_000)
        expect(output.queued).toBe(0)
        store(DATA, mono(0, 0))
        at(0.25)
        store(CONTROL, PCM_ON_BIT | PCM_STEREO_BIT)
        expect(output.queued).toBe(0)
        expect(cuts()).toEqual([
            { type: 'cut', after: 0.1, device: 'dsp' },
            { type: 'cut', after: 0.2, device: 'dsp' },
            { type: 'cut', after: 0.25, device: 'dsp' }
        ])
    })

    it('reads the whole FIFO free while off, as it is empty', () => {
        const { readFree } = setup()
        expect(readFree()).toBe(PCM_FIFO_FRAMES)
    })
})

describe('in a Testcase', () => {
    it('is silent, but drains on the virtual clock', () => {
        const { start, store, mono, readFree, chunks, at } = setup({ virtual: true, silent: true })
        start(PCM_ON_BIT, 8000)
        for (let i = 0; i < 10; i++) store(DATA, mono(0, 0))
        at(1)
        readFree()
        expect(readFree()).toBe(PCM_FIFO_FRAMES - 12)
        expect(chunks()).toEqual([])
    })

    it('moves the virtual clock to the next word’s room when a full FIFO is read, so polling never spins', () => {
        const { start, store, mono, readFree, clock, output } = setup({
            virtual: true,
            silent: true
        })
        start(PCM_ON_BIT, 8000)
        for (let i = 0; i < PCM_FIFO_FRAMES / 2; i++) store(DATA, mono(0, 0))
        expect(readFree()).toBe(0)
        //two frames, a mono word, at 8,000 frames a second
        expect(clock.now()).toBeCloseTo(0.25, 9)
        expect(readFree()).toBe(2)
        store(DATA, mono(0, 0))
        //a second more of sound, written as a program waiting on Free writes it: two reads a word
        let reads = 0
        for (let i = 0; i < 4000; i++) {
            while (readFree() === 0) reads++
            store(DATA, mono(0, 0))
        }
        expect(reads).toBe(4000)
        expect(output.queued).toBe(PCM_FIFO_FRAMES)
        expect(clock.now()).toBeCloseTo(1000.25, 6)
    })

    it('moves the clock a word at a time for a program waiting for more room than one word', () => {
        const { start, store, mono, readFree, clock } = setup({ virtual: true, silent: true })
        start(PCM_ON_BIT, 8000)
        for (let i = 0; i < PCM_FIFO_FRAMES / 2; i++) store(DATA, mono(0, 0))
        //a program that refills in batches: it waits until 512 frames fit, reading Free each time
        let reads = 1
        while (readFree() < 512) reads++
        //two reads a word: one that sees no change, and moves the clock, and one that sees the room
        expect(clock.now()).toBeCloseTo(512 / 2 / 4, 9)
        expect(reads).toBe(512)
        //a read after a write moves nothing while there is room
        store(DATA, mono(0, 0))
        const now = clock.now()
        readFree()
        expect(clock.now()).toBe(now)
    })

    it('moves the clock by one frame in stereo, and not at all while there is room', () => {
        const { start, store, readFree, clock } = setup({ virtual: true })
        start(PCM_ON_BIT | PCM_STEREO_BIT, 16_000)
        readFree()
        expect(clock.now()).toBe(0)
        for (let i = 0; i < PCM_FIFO_FRAMES; i++) store(DATA, 0)
        readFree()
        expect(clock.now()).toBeCloseTo(1 / 16, 9)
    })
})

describe('Undo', () => {
    it('takes back frames that have not played, cutting them from where the write began', () => {
        const { start, store, mono, output, cuts, chunks } = setup()
        start(PCM_ON_BIT, 8000)
        store(DATA, mono(0, 0))
        store(DATA, mono(0, 0))
        chunks()
        output.undoAfter(3n)
        expect(output.queued).toBe(2)
        expect(cuts()).toEqual([{ type: 'cut', after: 0.25, device: 'dsp' }])
    })

    it('takes back only what has not played: frames already heard stay heard', () => {
        const { start, store, mono, output, cuts, at } = setup()
        start(PCM_ON_BIT, 8000)
        store(DATA, mono(0, 0))
        at(10)
        output.undoAfter(2n)
        expect(output.queued).toBe(0)
        expect(cuts()).toEqual([{ type: 'cut', after: 10, device: 'dsp' }])
    })

    it('puts the settings back, the rate and Control', () => {
        const { start, store, output, word } = setup()
        start(PCM_ON_BIT | PCM_STEREO_BIT, 22_050)
        store(RATE, 44_100)
        store(CONTROL, 0)
        output.undoAfter(2n)
        expect(word(RATE)).toBe(22_050)
        expect(word(CONTROL)).toBe(PCM_ON_BIT | PCM_STEREO_BIT)
        output.undoAfter(0n)
        expect(word(RATE)).toBe(8000)
        expect(word(CONTROL)).toBe(0)
    })

    it('does not bring back what a setting dropped', () => {
        const { start, store, mono, output } = setup()
        start(PCM_ON_BIT, 8000)
        store(DATA, mono(0, 0))
        store(RATE, 16_000)
        output.undoAfter(3n)
        expect(output.queued).toBe(0)
        expect(output.frameRate).toBe(8000)
    })
})

describe('covered by a bitmap display, and Pokes', () => {
    it('writes no word and hears no store while covered, and states its block once uncovered', () => {
        const { output, store, word } = setup()
        output.setCovered(true)
        store(CONTROL, 0xff0000)
        expect(word(CONTROL)).toBe(0xff0000)
        expect(output.on).toBe(false)
        output.setCovered(false)
        expect(word(CONTROL)).toBe(0)
        expect(word(FREE)).toBe(PCM_FIFO_FRAMES)
    })

    it('ignores a Poke, stating its words again over it', () => {
        const { output, bus, word } = setup()
        bus.push(CONTROL, 3)
        output.stored(CONTROL, 4, 3, false)
        expect(output.on).toBe(false)
        expect(word(CONTROL)).toBe(0)
    })
})
