import { describe, expect, it } from 'vitest'
import { readMemoryPage } from './memoryPage'

/**
 * A Core whose memory is readable only inside `ranges`, each `[start, end)`, failing a whole read
 * that touches anything else as the MARS Cores do, and counting the reads it was asked for.
 */
function core(ranges: [bigint, bigint][], failure: 'throw' | 'short' = 'throw') {
    const readable = (address: bigint) => ranges.some(([s, e]) => address >= s && address < e)
    const counter = { reads: 0 }
    const read = (address: bigint, length: number) => {
        counter.reads += 1
        for (let i = 0n; i < BigInt(length); i++) {
            if (readable(address + i)) continue
            //the M68K Core answers a bad range with an empty array instead of an error
            if (failure === 'short') return new Uint8Array(0)
            throw new Error(`address out of range 0x${(address + i).toString(16)}`)
        }
        return Uint8Array.from({ length }, (_, i) => Number((address + BigInt(i)) & 0xffn))
    }
    return { read, counter }
}

const describeError = (e: unknown) => (e instanceof Error ? e.message : String(e))

describe('readMemoryPage', () => {
    it('reads a readable page in one read', () => {
        const { read, counter } = core([[0n, 0x1000n]])
        const page = readMemoryPage(read, 0x100n, 16, 0xff, describeError)
        expect(page.unreadable).toBeNull()
        expect(page.bytes[3]).toBe(0x03)
        expect(counter.reads).toBe(1)
    })

    it('reads up to the edge of a segment and marks the bytes past it', () => {
        const { read } = core([[0n, 0x10cn]])
        const page = readMemoryPage(read, 0x100n, 16, 0xff, describeError)
        expect([...page.bytes]).toEqual([
            0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xff,
            0xff, 0xff
        ])
        expect([...page.unreadable!.mask]).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1])
        expect(page.unreadable!.address).toBe(0x100n)
    })

    it('keeps the reason for the lowest byte it could not read', () => {
        const { read } = core([
            [0n, 0x103n],
            [0x105n, 0x10en]
        ])
        const page = readMemoryPage(read, 0x100n, 16, 0, describeError)
        expect([...page.unreadable!.mask]).toEqual([0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1])
        expect(page.unreadable!.reason).toBe('address out of range 0x103')
    })

    it('treats a short read as unreadable, with a reason of its own', () => {
        const { read } = core([[0n, 0x108n]], 'short')
        const page = readMemoryPage(read, 0x100n, 16, 0, describeError)
        expect(page.unreadable!.mask.indexOf(1)).toBe(8)
        expect(page.unreadable!.reason).toBe('0x108 is outside memory')
    })

    it('marks a page entirely outside memory without a value in it', () => {
        const { read } = core([])
        const page = readMemoryPage(read, 0x100n, 8, 0xaa, describeError)
        expect([...page.unreadable!.mask]).toEqual([1, 1, 1, 1, 1, 1, 1, 1])
        expect([...page.bytes]).toEqual([0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa])
    })

    it('finds where a readable run ends with a binary search', () => {
        const { read, counter } = core([[0x1a3n, 0x1000n]])
        const page = readMemoryPage(read, 0x100n, 256, 0, describeError)
        expect(page.unreadable!.mask.indexOf(0)).toBe(0xa3)
        //the whole page, a read per byte before the run, and one for the run that reaches the end
        expect(counter.reads).toBe(1 + 0xa3 + 2)

        const tail = core([[0n, 0x1a3n]])
        readMemoryPage(tail.read, 0x100n, 256, 0, describeError)
        //the whole page, a search over the run's length, then a read per byte after it
        expect(tail.counter.reads).toBeLessThanOrEqual(1 + 1 + Math.log2(256) + (0x100 - 0xa3))
    })

    it('costs a read per byte for a page entirely outside memory', () => {
        const { read, counter } = core([])
        readMemoryPage(read, 0x100n, 256, 0, describeError)
        expect(counter.reads).toBe(1 + 256)
    })

    it('reads only the known readable runs again at the same address', () => {
        const { read, counter } = core([
            [0n, 0x103n],
            [0x105n, 0x10en]
        ])
        const first = readMemoryPage(read, 0x100n, 16, 0, describeError)
        counter.reads = 0
        const again = readMemoryPage(read, 0x100n, 16, 0, describeError, first.unreadable)
        expect(counter.reads).toBe(2)
        expect(again.unreadable).toBe(first.unreadable)
        expect([...again.bytes]).toEqual([...first.bytes])
    })

    it('does not reuse what another address found', () => {
        const { read } = core([[0n, 0x108n]])
        const first = readMemoryPage(read, 0x100n, 16, 0, describeError)
        const moved = readMemoryPage(read, 0x0n, 16, 0, describeError, first.unreadable)
        expect(moved.unreadable).toBeNull()
    })

    it('searches again when a byte it read before fails', () => {
        const segments: [bigint, bigint][] = [[0n, 0x10cn]]
        const { read } = core(segments)
        const first = readMemoryPage(read, 0x100n, 16, 0, describeError)
        segments[0] = [0n, 0x104n]
        const again = readMemoryPage(read, 0x100n, 16, 0, describeError, first.unreadable)
        expect(again.unreadable!.mask.indexOf(1)).toBe(4)
    })
})
